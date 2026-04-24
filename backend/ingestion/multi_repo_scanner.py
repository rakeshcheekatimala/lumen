"""
Multi-repo orchestration layer. Scans N repos, detects cross-repo edges,
and groups repos by shared parent directory.

Each function is pure — no graph mutation. Callers (endpoints) handle
writing to GraphBuilder.
"""
import logging
from pathlib import Path
from collections import defaultdict
from typing import Callable

from graph.models import ServiceNode, ServiceEdge, RepoScanResult, RepoGroup
from ingestion.repo_scanner import RepoScanner
from ai.repo_analyzer import analyze_repo, to_graph_models

logger = logging.getLogger(__name__)

MergeFn = Callable[
    [list[ServiceNode], list[ServiceEdge], list[ServiceNode], list[ServiceEdge]],
    tuple[list[ServiceNode], list[ServiceEdge]],
]


def scan_single_repo(
    repo_path: str,
    strategy: str,
    merge_fn: MergeFn,
) -> RepoScanResult:
    """
    Scans one repo. Never raises — errors stored in result.error.
    """
    repo_name = Path(repo_path).name

    static_nodes: list[ServiceNode] = []
    static_edges: list[ServiceEdge] = []
    ai_nodes: list[ServiceNode] = []
    ai_edges: list[ServiceEdge] = []

    try:
        if strategy in ("static", "both"):
            static_nodes, static_edges = RepoScanner(repo_path).scan()

        if strategy in ("ai", "both"):
            ai_result = analyze_repo(repo_path)
            ai_nodes, ai_edges = to_graph_models(ai_result)

        if strategy == "static":
            nodes, edges = static_nodes, static_edges
        elif strategy == "ai":
            nodes, edges = ai_nodes, ai_edges
        else:
            nodes, edges = merge_fn(static_nodes, static_edges, ai_nodes, ai_edges)

        # Detect and prefix colliding service IDs (same id, different repo_name)
        # Caller resolves cross-batch collisions; single-repo is clean here.
        return RepoScanResult(
            repo_path=repo_path,
            repo_name=repo_name,
            services=nodes,
            edges=edges,
        )

    except Exception as exc:
        logger.warning("scan_single_repo failed for %s: %s", repo_path, exc)
        return RepoScanResult(
            repo_path=repo_path,
            repo_name=repo_name,
            services=[],
            edges=[],
            error=str(exc),
        )


def _resolve_collisions(
    results: list[RepoScanResult],
) -> list[RepoScanResult]:
    """
    If two repos both contain a service with the same id, prefix both with
    their repo name to avoid silent overwrites in the graph.
    Returns new RepoScanResult objects (immutable update).
    """
    id_to_repos: dict[str, list[str]] = defaultdict(list)
    for r in results:
        for svc in r.services:
            id_to_repos[svc.id].append(r.repo_name)

    colliding = {sid for sid, repos in id_to_repos.items() if len(repos) > 1}
    if not colliding:
        return results

    logger.warning("Service ID collisions across repos: %s — prefixing with repo name", colliding)

    updated: list[RepoScanResult] = []
    for r in results:
        id_remap: dict[str, str] = {}
        new_services: list[ServiceNode] = []
        for svc in r.services:
            if svc.id in colliding:
                new_id = f"{r.repo_name}/{svc.id}"
                id_remap[svc.id] = new_id
                new_services.append(svc.model_copy(update={"id": new_id}))
            else:
                new_services.append(svc)

        new_edges: list[ServiceEdge] = []
        for edge in r.edges:
            new_src = id_remap.get(edge.source, edge.source)
            new_tgt = id_remap.get(edge.target, edge.target)
            if new_src != edge.source or new_tgt != edge.target:
                new_edges.append(edge.model_copy(update={"source": new_src, "target": new_tgt}))
            else:
                new_edges.append(edge)

        updated.append(r.model_copy(update={"services": new_services, "edges": new_edges}))

    return updated


def detect_cross_repo_edges(
    results: list[RepoScanResult],
) -> list[ServiceEdge]:
    """
    Finds edges from repo A that target a service uniquely owned by repo B.

    Algorithm:
    1. Build service_id -> [repo_names] map across all results.
    2. Keep only service IDs uniquely owned by exactly one repo
       (ambiguous IDs like "postgres" appearing in 3 repos are skipped).
    3. For each result, emit cross-repo edge when:
       - edge.target NOT in this repo's own service set
       - edge.target IS uniquely owned by a different repo
    4. Dedup by (source, target).
    """
    service_to_repos: dict[str, list[str]] = defaultdict(list)
    for r in results:
        for svc in r.services:
            service_to_repos[svc.id].append(r.repo_name)

    unique_owners: dict[str, str] = {
        sid: repos[0]
        for sid, repos in service_to_repos.items()
        if len(repos) == 1
    }

    cross_edges: list[ServiceEdge] = []
    seen: set[tuple[str, str]] = set()

    for r in results:
        own_svc_ids = {svc.id for svc in r.services}
        for edge in r.edges:
            if (
                edge.target not in own_svc_ids
                and edge.target in unique_owners
                and unique_owners[edge.target] != r.repo_name
            ):
                key = (edge.source, edge.target)
                if key not in seen:
                    cross_edges.append(
                        edge.model_copy(update={"label": "cross-repo"})
                    )
                    seen.add(key)

    return cross_edges


def group_by_parent_directory(
    results: list[RepoScanResult],
    cross_edges: list[ServiceEdge],
) -> tuple[list[RepoGroup], list[str]]:
    """
    Groups repos that share a common immediate parent directory.

    Returns (groups, independent_repo_names).
    A repo is "independent" when its parent directory is not shared
    with any other repo in this batch.
    """
    parent_to_repos: dict[str, list[str]] = defaultdict(list)
    for r in results:
        parent = str(Path(r.repo_path).parent)
        parent_to_repos[parent].append(r.repo_name)

    # Map repo_name -> set of its service IDs (for cross-edge counting)
    repo_to_svc_ids: dict[str, set[str]] = {
        r.repo_name: {svc.id for svc in r.services}
        for r in results
    }

    # Map repo_name -> (services_count, edges_count)
    repo_stats: dict[str, tuple[int, int]] = {
        r.repo_name: (len(r.services), len(r.edges))
        for r in results
    }

    groups: list[RepoGroup] = []
    independent: list[str] = []

    for parent, repo_names in parent_to_repos.items():
        if len(repo_names) < 2:
            independent.extend(repo_names)
            continue

        # Count cross-repo edges where BOTH endpoints belong to repos in this group
        group_svc_ids: set[str] = set()
        for rn in repo_names:
            group_svc_ids |= repo_to_svc_ids.get(rn, set())

        cross_count = sum(
            1 for e in cross_edges
            if e.source in group_svc_ids and e.target in group_svc_ids
        )

        total_services = sum(repo_stats[rn][0] for rn in repo_names)
        total_edges = sum(repo_stats[rn][1] for rn in repo_names)

        groups.append(
            RepoGroup(
                group_name=Path(parent).name or parent,
                repo_names=repo_names,
                services_count=total_services,
                edges_count=total_edges,
                cross_repo_edges_count=cross_count,
            )
        )

    return groups, independent


def scan_multiple_repos(
    repo_paths: list[str],
    strategy: str,
    merge_fn: MergeFn,
) -> tuple[list[ServiceNode], list[ServiceEdge], list[RepoScanResult], list[ServiceEdge]]:
    """
    Orchestrates multi-repo scan.

    Returns (all_nodes, all_edges, per_repo_results, cross_edges).
    Caller is responsible for graph mutation and response assembly.
    """
    per_repo_results = [
        scan_single_repo(path, strategy, merge_fn)
        for path in repo_paths
    ]

    # Resolve service ID collisions before cross-linking
    per_repo_results = _resolve_collisions(per_repo_results)

    cross_edges = detect_cross_repo_edges(per_repo_results)

    # Collect all nodes, dedup by id (last writer wins after collision resolution)
    node_map: dict[str, ServiceNode] = {}
    for r in per_repo_results:
        for svc in r.services:
            node_map[svc.id] = svc

    # Collect all edges, dedup by (source, target)
    edge_set: set[tuple[str, str]] = set()
    all_edges: list[ServiceEdge] = []
    for r in per_repo_results:
        for e in r.edges:
            key = (e.source, e.target)
            if key not in edge_set:
                all_edges.append(e)
                edge_set.add(key)

    for e in cross_edges:
        key = (e.source, e.target)
        if key not in edge_set:
            all_edges.append(e)
            edge_set.add(key)

    return list(node_map.values()), all_edges, per_repo_results, cross_edges
