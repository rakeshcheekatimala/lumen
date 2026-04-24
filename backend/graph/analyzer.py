"""Blast radius and RCA analysis using NetworkX graph traversal."""
import networkx as nx
from graph.models import (
    ServiceNode, ChangeRequest, BlastRadiusResult,
    ImpactedService, RCARequest, RCAResult
)
from graph.builder import GraphBuilder


def _risk_level(depth: int, total_impacted: int) -> str:
    if depth == 1 and total_impacted >= 3:
        return "critical"
    if depth == 1:
        return "high"
    if depth == 2:
        return "medium"
    return "low"


def compute_blast_radius(builder: GraphBuilder, change: ChangeRequest) -> BlastRadiusResult:
    """
    Traverse the reverse dependency graph from the changed service.
    Returns all services that transitively depend on it.
    """
    graph = builder.graph
    services = builder.services

    changed_service = services.get(change.service_id)
    if not changed_service:
        raise ValueError(f"Service '{change.service_id}' not found in graph")

    # Build reverse graph: edge from provider → consumer becomes consumer → provider
    reverse_graph = graph.reverse(copy=True)

    # BFS from changed service in reverse graph to find all dependents
    impacted: list[ImpactedService] = []
    visited = {change.service_id}
    queue = [(change.service_id, 0)]  # (node, depth)
    propagation_paths: list[list[str]] = []

    while queue:
        current, depth = queue.pop(0)
        if depth == 0:
            continue  # skip the changed service itself

        svc = services.get(current)
        if not svc:
            continue

        # Find which endpoints of this service call the changed service
        affected_endpoints = []
        for u, v, data in builder.graph.edges(data=True):
            if u == current and v == change.service_id:
                affected_endpoints.extend(data.get("endpoints_called", []))

        impacted.append(ImpactedService(
            service_id=current,
            service_name=svc.name,
            team=svc.team,
            depth=depth,
            impact_type="direct" if depth == 1 else "transitive",
            affected_endpoints=affected_endpoints,
            risk_level=_risk_level(depth, len(visited)),
        ))

    # Re-do with proper BFS tracking depth
    impacted = []
    visited = {change.service_id}
    from collections import deque
    q = deque()

    # reverse_graph has edges FROM dependents TO providers
    # We want services that depend on change.service_id → look at who calls it in original graph
    for predecessor in graph.predecessors(change.service_id):
        if predecessor not in visited:
            visited.add(predecessor)
            q.append((predecessor, 1, [change.service_id, predecessor]))

    while q:
        current, depth, path = q.popleft()
        svc = services.get(current)
        if not svc:
            continue

        affected_endpoints = []
        for _, v, data in graph.out_edges(current, data=True):
            if v == change.service_id or (depth > 1 and v in visited):
                affected_endpoints.extend(data.get("endpoints_called", []))

        impacted.append(ImpactedService(
            service_id=current,
            service_name=svc.name,
            team=svc.team,
            depth=depth,
            impact_type="direct" if depth == 1 else "transitive",
            affected_endpoints=list(set(affected_endpoints)),
            risk_level=_risk_level(depth, 0),
        ))
        propagation_paths.append(path)

        # Go one level deeper
        for predecessor in graph.predecessors(current):
            if predecessor not in visited:
                visited.add(predecessor)
                q.append((predecessor, depth + 1, path + [predecessor]))

    overall_risk = "low"
    if impacted:
        direct = [i for i in impacted if i.depth == 1]
        if len(direct) >= 3:
            overall_risk = "critical"
        elif len(direct) >= 1 and len(impacted) >= 4:
            overall_risk = "high"
        elif len(direct) >= 1:
            overall_risk = "medium"

    endpoint_id = change.endpoint_id or "unknown"

    return BlastRadiusResult(
        changed_service=change.service_id,
        changed_service_name=changed_service.name,
        changed_endpoint=endpoint_id,
        change_type=change.change_type,
        impacted_services=impacted,
        total_impacted=len(impacted),
        risk_level=overall_risk,
        propagation_paths=propagation_paths,
    )


def compute_rca(builder: GraphBuilder, request: RCARequest) -> RCAResult:
    """
    Given an incident on a service, identify likely root causes by
    looking at all upstream dependencies (what does this service call?)
    and computing which ones could cause cascading failures.
    """
    graph = builder.graph
    services = builder.services

    incident_service = services.get(request.incident_service)
    if not incident_service:
        raise ValueError(f"Service '{request.incident_service}' not found")

    # Find all services this service depends on (upstream providers)
    upstream: list[dict] = []
    for _, target in graph.out_edges(request.incident_service):
        svc = services.get(target)
        if svc:
            edge_data = graph.get_edge_data(request.incident_service, target) or {}
            upstream.append({
                "service_id": target,
                "service_name": svc.name,
                "team": svc.team,
                "protocol": edge_data.get("protocol", "unknown"),
                "endpoints_called": edge_data.get("endpoints_called", []),
                "risk_score": svc.risk_score,
                "candidate_probability": round(svc.risk_score * 0.8 + 0.1, 2),
            })

    # Sort by risk score (most likely to be the cause)
    upstream.sort(key=lambda x: x["candidate_probability"], reverse=True)

    # Also compute blast radius for context (who else is affected)
    from collections import deque
    affected = []
    visited = {request.incident_service}
    q = deque([(request.incident_service, 0)])
    while q:
        current, depth = q.popleft()
        for predecessor in graph.predecessors(current):
            if predecessor not in visited:
                visited.add(predecessor)
                svc = services.get(predecessor)
                if svc:
                    affected.append(ImpactedService(
                        service_id=predecessor,
                        service_name=svc.name,
                        team=svc.team,
                        depth=depth + 1,
                        impact_type="direct" if depth == 0 else "transitive",
                        risk_level="high" if depth == 0 else "medium",
                    ))
                q.append((predecessor, depth + 1))

    return RCAResult(
        root_cause_candidates=upstream[:5],
        blast_radius=affected,
        ai_analysis="",  # filled by AI layer
        recommended_actions=[
            f"Check health of {upstream[0]['service_name']} first" if upstream else "Investigate service logs",
            "Review recent deployments in the last 2 hours",
            "Check Kafka consumer lag for async dependencies",
            "Verify circuit breaker states in the service mesh",
        ],
    )
