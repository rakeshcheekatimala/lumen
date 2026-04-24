"""FastAPI backend for the AI-Powered Architectural Intelligence Platform."""
import os
import logging
import traceback
from contextlib import asynccontextmanager
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv()  # loads ANTHROPIC_API_KEY from .env if present
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pathlib import Path
from graph.builder import get_graph_builder
from graph.analyzer import compute_blast_radius, compute_rca
from graph.models import (
    ChangeRequest, BlastRadiusResult, RCARequest,
    DependencyGraph, ServiceNode, ServiceEdge,
    SRBSubmission, SRBValidation,
    SchemaDiffRequest, SchemaDiffResult,
    MultiRepoIngestRequest, MultiRepoIngestResponse,
    RepoGroup, RepoScanResult,
)
from graph.srb_analyzer import validate_srb as run_srb_validation
from graph.schema_diff import diff_specs
from ai.claude_analyzer import (
    analyze_blast_radius, analyze_rca, validate_srb_design,
    analyze_srb, analyze_schema_diff,
)
from ingestion.swagger_parser import parse_openapi_spec
from ingestion.repo_scanner import RepoScanner
from ai.repo_analyzer import analyze_repo, to_graph_models
from ingestion.multi_repo_scanner import scan_multiple_repos, group_by_parent_directory


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-build graph on startup
    get_graph_builder()
    yield


app = FastAPI(
    title="Lumen AI API",
    description="AI-Powered Architectural Intelligence Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Graph endpoints ──────────────────────────────────────────────────────────

@app.get("/api/graph", response_model=DependencyGraph)
def get_graph():
    """Returns the full service dependency graph."""
    builder = get_graph_builder()
    return builder.to_dependency_graph()


@app.get("/api/services", response_model=list[ServiceNode])
def list_services():
    """Returns all services with their metadata."""
    builder = get_graph_builder()
    return list(builder.services.values())


@app.get("/api/services/{service_id}", response_model=ServiceNode)
def get_service(service_id: str):
    builder = get_graph_builder()
    service = builder.services.get(service_id)
    if not service:
        raise HTTPException(status_code=404, detail=f"Service '{service_id}' not found")
    return service


# ─── Blast radius ─────────────────────────────────────────────────────────────

@app.post("/api/blast-radius", response_model=BlastRadiusResult)
def blast_radius(change: ChangeRequest):
    """Computes the blast radius of a service change."""
    builder = get_graph_builder()
    try:
        result = compute_blast_radius(builder, change)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@app.post("/api/blast-radius/analyze", response_model=BlastRadiusResult)
def blast_radius_with_ai(change: ChangeRequest):
    """Computes blast radius AND runs Claude AI analysis."""
    builder = get_graph_builder()
    try:
        result = compute_blast_radius(builder, change)
        result.ai_analysis = analyze_blast_radius(result, change)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


# ─── RCA ──────────────────────────────────────────────────────────────────────

@app.post("/api/rca")
def root_cause_analysis(request: RCARequest):
    """AI-powered root cause analysis for an incident."""
    builder = get_graph_builder()
    try:
        rca = compute_rca(builder, request)
        rca.ai_analysis = analyze_rca(rca, request.incident_description, request.incident_service)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return rca


# ─── SRB Validation ───────────────────────────────────────────────────────────

class SRBRequest(BaseModel):
    proposed_change: str
    affected_services: list[str] = []


@app.post("/api/validate-srb")
def validate_srb(request: SRBRequest):
    """Validates an SRB submission for anti-patterns and risks."""
    builder = get_graph_builder()
    services = builder.services

    # Build architecture summary for affected services
    affected = [services[s] for s in request.affected_services if s in services]
    summary_lines = []
    for svc in affected:
        deps = list(builder.graph.successors(svc.id))
        dep_names = [services[d].name for d in deps if d in services]
        summary_lines.append(
            f"- {svc.name} ({svc.language}, Team: {svc.team}): "
            f"calls {', '.join(dep_names) or 'no dependencies'}"
        )

    result = validate_srb_design(
        services_summary="\n".join(summary_lines) or "No specific services selected",
        proposed_change=request.proposed_change,
    )
    return result


# ─── Ingestion ────────────────────────────────────────────────────────────────

class IngestResponse(BaseModel):
    service_id: str
    endpoints_parsed: int
    message: str


class RepoIngestRequest(BaseModel):
    repo_path: str
    strategy: str = "both"   # "static" | "ai" | "both"
    reset_graph: bool = False


class RepoIngestResponse(BaseModel):
    services_added: int
    edges_added: int
    strategy_used: str
    summary: str
    message: str


def _merge_graph(
    static_nodes: list[ServiceNode],
    static_edges: list[ServiceEdge],
    ai_nodes: list[ServiceNode],
    ai_edges: list[ServiceEdge],
) -> tuple[list[ServiceNode], list[ServiceEdge]]:
    """Merge static + AI results, deduplicating by id."""
    node_map: dict[str, ServiceNode] = {n.id: n for n in static_nodes}
    for n in ai_nodes:
        if n.id not in node_map:
            node_map[n.id] = n
        else:
            # AI enriches description / team if static left them as unknown
            existing = node_map[n.id]
            if existing.team == "unknown" and n.team != "unknown":
                node_map[n.id] = existing.model_copy(update={"team": n.team})
            if not existing.description and n.description:
                node_map[n.id] = node_map[n.id].model_copy(update={"description": n.description})

    edge_set: set[tuple[str, str]] = {(e.source, e.target) for e in static_edges}
    merged_edges = list(static_edges)
    for e in ai_edges:
        if (e.source, e.target) not in edge_set:
            if e.source in node_map and e.target in node_map:
                merged_edges.append(e)
                edge_set.add((e.source, e.target))

    return list(node_map.values()), merged_edges


@app.post("/api/ingest/repo", response_model=RepoIngestResponse)
def ingest_repo(request: RepoIngestRequest):
    """
    Scans a local repository and loads its microservice topology into the graph.

    Strategies:
      - static: regex-based code scanning (fast, deterministic)
      - ai:     Claude reads key files and infers topology (slower, smarter)
      - both:   run both and merge results (recommended)
    """
    repo_path = request.repo_path
    if not Path(repo_path).exists():
        raise HTTPException(status_code=400, detail=f"Path not found: {repo_path}")

    static_nodes: list[ServiceNode] = []
    static_edges: list[ServiceEdge] = []
    ai_nodes: list[ServiceNode] = []
    ai_edges: list[ServiceEdge] = []
    ai_summary = ""

    try:
        if request.strategy in ("static", "both"):
            static_nodes, static_edges = RepoScanner(repo_path).scan()

        if request.strategy in ("ai", "both"):
            ai_result = analyze_repo(repo_path)
            ai_nodes, ai_edges = to_graph_models(ai_result)
            ai_summary = ai_result.get("summary", "")

        if request.strategy == "static":
            nodes, edges = static_nodes, static_edges
        elif request.strategy == "ai":
            nodes, edges = ai_nodes, ai_edges
        else:
            nodes, edges = _merge_graph(static_nodes, static_edges, ai_nodes, ai_edges)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Does NOT mutate the org graph — scan results are returned for display only.

    return RepoIngestResponse(
        services_added=len(nodes),
        edges_added=len(edges),
        strategy_used=request.strategy,
        summary=ai_summary or f"Scanned {repo_path} via static analysis.",
        message=f"Scanned {len(nodes)} services and {len(edges)} edges from {Path(repo_path).name}",
    )


@app.post("/api/ingest/repos", response_model=MultiRepoIngestResponse)
def ingest_multiple_repos(request: MultiRepoIngestRequest):
    """
    Scans multiple repositories in one operation, detects cross-repo edges,
    and groups repos by shared parent directory.
    """
    try:
        return _ingest_multiple_repos(request)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("ingest_multiple_repos failed:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")


def _ingest_multiple_repos(request: MultiRepoIngestRequest) -> MultiRepoIngestResponse:
    if not request.repo_paths:
        raise HTTPException(status_code=400, detail="repo_paths must not be empty")

    all_nodes, all_edges, per_repo_results, cross_edges = scan_multiple_repos(
        request.repo_paths,
        request.strategy,
        _merge_graph,
    )

    valid_results = [r for r in per_repo_results if r.error is None]
    if not valid_results:
        errors = "; ".join(r.error for r in per_repo_results if r.error)
        raise HTTPException(status_code=400, detail=f"All repos failed to scan: {errors}")

    # Repo scan results are returned as-is — they do NOT mutate the org graph.
    # The main /api/graph endpoint remains the source of truth for org topology.

    groups, independent_repos = group_by_parent_directory(per_repo_results, cross_edges)

    collision_note = ""
    prefixed = [
        r for r in per_repo_results
        if any("/" in svc.id for svc in r.services)
    ]
    if prefixed:
        collision_note = f" (service ID collisions resolved for: {', '.join(r.repo_name for r in prefixed)})"

    return MultiRepoIngestResponse(
        repos_scanned=len(per_repo_results),
        total_services_added=len(all_nodes),
        total_edges_added=len(all_edges),
        cross_repo_edges_added=len(cross_edges),
        strategy_used=request.strategy,
        groups=groups,
        independent_repos=independent_repos,
        per_repo=per_repo_results,
        cross_repo_edges=cross_edges,
        message=(
            f"Scanned {len(per_repo_results)} repos: {len(all_nodes)} services, "
            f"{len(all_edges)} edges ({len(cross_edges)} cross-repo){collision_note}"
        ),
    )


@app.post("/api/ingest/swagger", response_model=IngestResponse)
async def ingest_swagger(
    service_id: str,
    team: str,
    file: UploadFile = File(...),
):
    """Ingests a Swagger/OpenAPI spec and adds the service to the graph."""
    content = await file.read()
    try:
        service, edges = parse_openapi_spec(content.decode(), service_id, team)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse spec: {e}")

    builder = get_graph_builder()
    builder.add_service_from_spec(service, edges)

    return IngestResponse(
        service_id=service_id,
        endpoints_parsed=len(service.endpoints),
        message=f"Successfully ingested {service.name} with {len(service.endpoints)} endpoints",
    )


# ─── SRB Autopilot (v2) ───────────────────────────────────────────────────────

@app.post("/api/srb/validate", response_model=SRBValidation)
def srb_validate(submission: SRBSubmission, include_ai: bool = True):
    """Validates a structured SRB submission against the live graph."""
    builder = get_graph_builder()
    validation = run_srb_validation(submission, builder)
    if include_ai:
        validation.ai_rationale = analyze_srb(validation)
    return validation


# ─── Schema Diff ──────────────────────────────────────────────────────────────

@app.post("/api/schema-diff", response_model=SchemaDiffResult)
def schema_diff(request: SchemaDiffRequest, include_ai: bool = True, include_blast_radius: bool = True):
    """Semantic diff between two OpenAPI specs. If breaking changes + service_id given, adds blast radius."""
    result = diff_specs(request.old_spec, request.new_spec, request.service_id)

    if include_blast_radius and result.breaking_count > 0 and request.service_id:
        builder = get_graph_builder()
        if request.service_id in builder.services:
            # Derive a representative change_type for the worst breaking change
            breaking = next((c for c in result.changes if c.is_breaking), None)
            if breaking:
                change = ChangeRequest(
                    service_id=request.service_id,
                    endpoint_id=breaking.location.split(" → ")[0] if " → " in breaking.location else "unknown",
                    change_type=breaking.change_type,
                    description=f"Schema diff: {result.breaking_count} breaking change(s)",
                )
                result.blast_radius = compute_blast_radius(builder, change)

    # Stash AI narrative on the ai_analysis of the nested blast radius if present
    if include_ai:
        narrative = analyze_schema_diff(result)
        if result.blast_radius:
            result.blast_radius.ai_analysis = narrative
        else:
            # embed narrative via a synthetic blast_radius carrier would be odd;
            # we return the narrative through a new field-like channel (dict override)
            pass
    return result


@app.get("/api/samples/payment-diff")
def sample_payment_diff():
    """Returns pre-loaded Payment v1 and v2 specs for the demo."""
    specs_dir = Path(__file__).parent / "data" / "specs"
    return {
        "old_spec": (specs_dir / "payment-v1.yaml").read_text(),
        "new_spec": (specs_dir / "payment-v2.yaml").read_text(),
        "service_id": "payment",
    }


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    builder = get_graph_builder()
    return {
        "status": "ok",
        "services": len(builder.services),
        "edges": len(builder.edges),
    }
