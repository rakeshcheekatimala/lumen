"""FastAPI backend for the AI-Powered Architectural Intelligence Platform."""
import os
import logging
import traceback
import asyncio
import uuid
from datetime import datetime
from contextlib import asynccontextmanager
from dotenv import load_dotenv

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.DEBUG)

load_dotenv()  # loads ANTHROPIC_API_KEY from .env if present
from fastapi import FastAPI, HTTPException, UploadFile, File, WebSocket, WebSocketDisconnect
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
    ChatMessage, ChatMessageType,
)
from graph.srb_analyzer import validate_srb as run_srb_validation
from graph.schema_diff import diff_specs
from ai.claude_analyzer import (
    analyze_blast_radius, analyze_rca, validate_srb_design,
    analyze_srb, analyze_schema_diff, analyze_blast_radius_with_graph,
    format_graph_context, MOCK_AI,
)
from ingestion.swagger_parser import parse_openapi_spec
from ingestion.repo_scanner import RepoScanner
from ai.repo_analyzer import analyze_repo, to_graph_models
from ingestion.multi_repo_scanner import scan_multiple_repos, group_by_parent_directory
from chat.store import connection_manager, chat_store


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
    """Computes blast radius AND runs Claude AI analysis with full org graph context."""
    builder = get_graph_builder()
    try:
        result = compute_blast_radius(builder, change)
        graph = builder.to_dependency_graph()
        ctx = format_graph_context(graph.services, graph.edges)
        result.ai_analysis = analyze_blast_radius(result, change, graph_context=ctx)
        result.ai_mode = "mock" if MOCK_AI else "real"
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
        graph = builder.to_dependency_graph()
        ctx = format_graph_context(graph.services, graph.edges)
        rca.ai_analysis = analyze_rca(rca, request.incident_description, request.incident_service, graph_context=ctx)
        rca.ai_mode = "mock" if MOCK_AI else "real"
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

    graph = builder.to_dependency_graph()
    ctx = format_graph_context(graph.services, graph.edges)
    result = validate_srb_design(
        services_summary="\n".join(summary_lines) or "No specific services selected",
        proposed_change=request.proposed_change,
        graph_context=ctx,
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
            org_graph = get_graph_builder().to_dependency_graph()
            org_ctx = format_graph_context(org_graph.services, org_graph.edges)
            ai_result = analyze_repo(repo_path, org_context=org_ctx)
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
        graph = builder.to_dependency_graph()
        ctx = format_graph_context(graph.services, graph.edges)
        validation.ai_rationale = analyze_srb(validation, graph_context=ctx)
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
        builder = get_graph_builder()
        graph = builder.to_dependency_graph()
        ctx = format_graph_context(graph.services, graph.edges)
        narrative = analyze_schema_diff(result, graph_context=ctx)
        if result.blast_radius:
            result.blast_radius.ai_analysis = narrative
            result.blast_radius.ai_mode = "mock" if MOCK_AI else "real"
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
        "ai_mode": "mock" if MOCK_AI else "real",
        "api_key_set": bool(os.environ.get("ANTHROPIC_API_KEY")),
    }


# ─── Chat ─────────────────────────────────────────────────────────────────────

@app.get("/api/chat/messages")
def get_chat_messages():
    """Returns the last N chat messages."""
    messages = chat_store.get_messages()
    logger.info(f"[CHAT] GET /chat/messages -> {len(messages)} messages")
    return messages


@app.websocket("/api/ws/chat")
async def websocket_chat(websocket: WebSocket):
    """WebSocket endpoint for real-time chat. Broadcasts messages to all connected clients."""
    client_id = str(uuid.uuid4())[:8]
    logger.info(f"[WS-{client_id}] ========== CONNECTION ATTEMPT ==========")
    logger.info(f"[WS-{client_id}] Client connecting from {websocket.client}")
    
    try:
        await connection_manager.connect(websocket)
        logger.info(f"[WS-{client_id}] ✓ WebSocket accepted and stored")
        logger.info(f"[WS-{client_id}] Total active connections: {len(connection_manager.active_connections)}")
        
        # Send a welcome message to verify connection works
        try:
            welcome_msg = ChatMessage(
                id=str(uuid.uuid4()),
                username="Lumen",
                user_id="system",
                type=ChatMessageType.system,
                content="✓ Connected to Lumen Chat. Ready to analyze blast radius impacts!",
                blast_radius=None,
                timestamp=datetime.utcnow().isoformat(),
            )
            logger.info(f"[WS-{client_id}] Creating welcome message: {welcome_msg.id}")
            
            welcome_dict = welcome_msg.model_dump()
            logger.info(f"[WS-{client_id}] Welcome dict keys: {welcome_dict.keys()}")
            
            await websocket.send_json(welcome_dict)
            logger.info(f"[WS-{client_id}] ✓✓✓ Welcome message SENT to client")
        except Exception as e:
            logger.error(f"[WS-{client_id}] ✗ Failed to send welcome message: {e}", exc_info=True)
        
        # Now listen for messages
        logger.info(f"[WS-{client_id}] Starting message listen loop...")
        
        while True:
            logger.info(f"[WS-{client_id}] Waiting for message...")
            data = await websocket.receive_json()
            logger.info(f"[WS-{client_id}] ✓ RECEIVED JSON: {data}")
            logger.info(f"[WS-{client_id}] Keys in received data: {data.keys()}")
            
            # Create ChatMessage from received data
            try:
                msg = ChatMessage(
                    id=str(uuid.uuid4()),
                    username=data.get("username", "Unknown"),
                    user_id=data.get("user_id", ""),
                    type=ChatMessageType(data.get("type", "text")),
                    content=data.get("content", ""),
                    blast_radius=data.get("blast_radius"),
                    timestamp=datetime.utcnow().isoformat(),
                )
                logger.info(f"[WS-{client_id}] ✓ ChatMessage created: {msg.id}")
                logger.info(f"[WS-{client_id}] Message details: type={msg.type}, username={msg.username}, content_len={len(msg.content)}")
            except Exception as e:
                logger.error(f"[WS-{client_id}] ✗ Failed to create ChatMessage: {e}", exc_info=True)
                continue
            
            # Store message
            try:
                chat_store.add_message(msg.model_dump())
                logger.info(f"[WS-{client_id}] ✓ Message stored in ChatStore")
                logger.info(f"[WS-{client_id}] Total messages in store: {len(chat_store.get_messages())}")
            except Exception as e:
                logger.error(f"[WS-{client_id}] ✗ Failed to store message: {e}", exc_info=True)
            
            # Broadcast to all clients
            try:
                logger.info(f"[WS-{client_id}] Preparing to broadcast to {len(connection_manager.active_connections)} connections")
                msg_dict = msg.model_dump()
                logger.info(f"[WS-{client_id}] Message dict size: {len(str(msg_dict))} chars")
                
                await connection_manager.broadcast(msg_dict)
                logger.info(f"[WS-{client_id}] ✓✓✓ BROADCAST COMPLETE")
            except Exception as e:
                logger.error(f"[WS-{client_id}] ✗ Broadcast failed: {e}", exc_info=True)
            
            # Trigger AI response for blast radius messages
            if msg.type == ChatMessageType.blast_radius:
                logger.info(f"[WS-{client_id}] Detected blast_radius message, spawning AI task")
                asyncio.create_task(_ai_chat_reply(msg))
            elif "blast" in msg.content.lower() or "impact" in msg.content.lower():
                logger.info(f"[WS-{client_id}] Detected potential AI trigger keywords, spawning text AI task")
                asyncio.create_task(_ai_text_response(msg))
            else:
                logger.info(f"[WS-{client_id}] No AI trigger detected for this message")
                
    except Exception as e:
        logger.error(f"[WS-{client_id}] ✗ FATAL ERROR in WebSocket loop: {e}", exc_info=True)
    finally:
        logger.info(f"[WS-{client_id}] WebSocket connection closing...")
        try:
            connection_manager.disconnect(websocket)
            logger.info(f"[WS-{client_id}] ✓ Disconnected. Remaining connections: {len(connection_manager.active_connections)}")
        except Exception as e:
            logger.error(f"[WS-{client_id}] ✗ Error during disconnect: {e}")
        logger.info(f"[WS-{client_id}] ========== CONNECTION CLOSED ==========")

async def _ai_chat_reply(source_msg: ChatMessage):
    """Generate and broadcast AI response to a blast_radius message with graph context."""
    logger.info(f"[CHAT AI] ========== AI REPLY STARTED for {source_msg.id} ==========")
    try:
        if not source_msg.blast_radius:
            logger.info(f"[CHAT AI] ✗ No blast_radius in message, skipping")
            return
        
        logger.info(f"[CHAT AI] ✓ Found blast_radius, generating response")
        
        # Get the blast radius result
        result = source_msg.blast_radius
        logger.info(f"[CHAT AI] Service: {result.changed_service}, Endpoint: {result.changed_endpoint}")
        
        # Get the full dependency graph for context
        logger.info(f"[CHAT AI] Loading full knowledge graph...")
        builder = get_graph_builder()
        graph = builder.to_dependency_graph()
        logger.info(f"[CHAT AI] Graph loaded: {len(graph.services)} services, {len(graph.edges)} edges")
        
        # Create a synthetic ChangeRequest for analyze_blast_radius
        change = ChangeRequest(
            service_id=result.changed_service,
            endpoint_id=result.changed_endpoint,
            change_type=result.change_type,
            description=f"Service: {result.changed_service_name}",
        )
        logger.info(f"[CHAT AI] Created ChangeRequest: {change}")
        
        # Generate AI analysis WITH graph context
        logger.info(f"[CHAT AI] Calling analyze_blast_radius_with_graph...")
        try:
            ai_response = analyze_blast_radius_with_graph(result, change, graph)
            logger.info(f"[CHAT AI] ✓ Got AI response, length: {len(ai_response)} chars")
            logger.info(f"[CHAT AI] Response preview: {ai_response[:200]}")
        except Exception as ai_error:
            logger.error(f"[CHAT AI] ✗ Analysis failed: {ai_error}, falling back to basic analysis", exc_info=True)
            try:
                ai_response = analyze_blast_radius(result, change)
            except:
                ai_response = f"Error analyzing blast radius: {str(ai_error)}"
        
        # Create and broadcast AI message
        logger.info(f"[CHAT AI] Creating ChatMessage for AI response")
        ai_msg = ChatMessage(
            id=str(uuid.uuid4()),
            username="Lumen AI",
            user_id="system",
            type=ChatMessageType.system,
            content=ai_response,
            blast_radius=None,
            timestamp=datetime.utcnow().isoformat(),
        )
        
        logger.info(f"[CHAT AI] Storing message: {ai_msg.id}")
        chat_store.add_message(ai_msg.model_dump())
        
        logger.info(f"[CHAT AI] Broadcasting to {len(connection_manager.active_connections)} connections")
        await connection_manager.broadcast(ai_msg.model_dump())
        logger.info(f"[CHAT AI] ✓ Response broadcasted successfully")
        logger.info(f"[CHAT AI] ========== AI REPLY COMPLETED ==========")
        
    except Exception as e:
        logger.error(f"[CHAT AI] ✗ FATAL ERROR: {e}", exc_info=True)
        logger.info(f"[CHAT AI] ========== AI REPLY FAILED ==========")


async def _should_trigger_ai_response(msg: ChatMessage) -> bool:
    """Check if a text message should trigger AI response."""
    keywords = ['blast', 'radius', 'impact', 'change', 'analyze', 'analysis', 'help', 'effect', 'service']
    content_lower = msg.content.lower()
    return any(keyword in content_lower for keyword in keywords)


async def _ai_text_response(source_msg: ChatMessage) -> str:
    """Generate AI response to a text message asking about blast radius analysis."""
    logger.info(f"[TEXT AI] Generating response to: {source_msg.content[:100]}")
    
    try:
        builder = get_graph_builder()
        graph = builder.to_dependency_graph()
        
        # Build a summary of the graph
        services_summary = "\n".join([f"- {s.name} ({s.language}, team: {s.team})" for s in graph.services[:10]])
        
        prompt = f"""You are an AI Architectural Analyst presenting insights for BOTH engineers and business stakeholders.

Transform the architecture context into a clean, decision-ready dashboard.

Output format rules:
- Start with a 1-line executive summary in plain English
- Then show Risk Dashboard with at most 4 bullets using 🔴 🟡 🟢
- Then show Critical Services (Ranked)
- Then show What Can Break (Blast Radius) with outcome-focused bullets
- Then show Why This Is Risky (Technical Insight) with only 3 to 4 bullets
- Then show Recommended Actions with clear owner mindset
- End with Quick Rule / Heuristic
- Use generous spacing
- Avoid long paragraphs
- No markdown clutter like ### or **
- Write like a senior engineer explaining to a PM

Here's the current architecture:

{services_summary}

Total services: {len(graph.services)}
Total dependencies: {len(graph.edges)}

User question: {source_msg.content}

Keep it under 320 words. Be specific to their question and make it look like a clean dashboard."""

        logger.info(f"[TEXT AI] Calling Claude...")
        from ai.claude_analyzer import _get_client, MODEL, MOCK_AI
        
        if MOCK_AI:
            logger.info(f"[TEXT AI] Using mock response")
            return """Executive Summary:
The services closest to payments and checkout deserve the most caution because issues there can quickly affect revenue-critical flows.

Risk Dashboard:
- 🔴 Highest exposure: Payment and Checkout sit on the main transaction path.
- 🔴 Cross-service risk: Breaking changes can spread into orders and customer confirmations.
- 🟡 Operational risk: Shared dependencies raise coordination needs across teams.
- 🟢 Best control: Run blast radius analysis before changing any service on the purchase path.

Critical Services (Ranked):
1. Payment
Why it is critical: It supports transaction completion for multiple flows.
Impact: Customers may be unable to pay successfully.

2. Checkout
Why it is critical: It orchestrates the purchase path and calls downstream services.
Impact: Orders may stall before completion.

3. Order
Why it is critical: It converts successful checkout into confirmed orders.
Impact: Customers may pay but not see confirmed purchases.

What Can Break (Blast Radius):
- Payments may fail.
- Orders may not be confirmed.
- Customer notifications may be delayed or missing.

Why This Is Risky (Technical Insight):
- These services have multiple downstream dependents.
- Contract changes can fail consumers immediately.
- Shared transaction paths need coordinated rollout order.

Recommended Actions:
- Service owner: confirm all direct consumers before making breaking changes.
- Platform team: run blast radius simulation before release approval.
- QA owner: validate the full purchase flow end to end.

Quick Rule / Heuristic:
If the service sits on the payment path, treat every breaking change as a cross-team release."""
        
        client = _get_client()
        message = client.messages.create(
            model=MODEL,
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        
        logger.info(f"[TEXT AI] Got response")
        return message.content[0].text
        
    except Exception as e:
        logger.error(f"[TEXT AI] Error: {e}", exc_info=True)
        return f"I encountered an error analyzing your question: {str(e)}"


async def _ai_text_response(source_msg: ChatMessage):
    """Generate and broadcast AI response to a text message asking about architecture."""
    logger.info(f"[TEXT AI BROADCAST] Starting response generation...")
    try:
        builder = get_graph_builder()
        graph = builder.to_dependency_graph()
        
        # Build a summary of the graph
        services_summary = "\n".join([f"- {s.name} ({s.language}, team: {s.team})" for s in graph.services[:10]])
        
        prompt = f"""You are an AI Architectural Analyst presenting insights for BOTH engineers and business stakeholders.

Transform the architecture context into a clean, decision-ready dashboard.

Output format rules:
- Start with a 1-line executive summary in plain English
- Then show Risk Dashboard with at most 4 bullets using 🔴 🟡 🟢
- Then show Critical Services (Ranked)
- Then show What Can Break (Blast Radius) with outcome-focused bullets
- Then show Why This Is Risky (Technical Insight) with only 3 to 4 bullets
- Then show Recommended Actions with clear owner mindset
- End with Quick Rule / Heuristic
- Use generous spacing
- Avoid long paragraphs
- No markdown clutter like ### or **
- Write like a senior engineer explaining to a PM

Here's the current architecture:

{services_summary}

Total services: {len(graph.services)}
Total dependencies: {len(graph.edges)}

User question: {source_msg.content}

Keep it under 320 words. Be specific to their question and make it look like a clean dashboard."""

        logger.info(f"[TEXT AI BROADCAST] Calling Claude...")
        from ai.claude_analyzer import _get_client, MODEL, MOCK_AI
        
        if MOCK_AI:
            logger.info(f"[TEXT AI BROADCAST] Using mock response")
            ai_response = """Executive Summary:
Changes on shared transaction services can quickly affect customer-facing workflows, so they need coordinated rollout discipline.

Risk Dashboard:
- 🔴 Highest exposure: Payment and Checkout influence the main revenue path.
- 🔴 Downstream impact: Order handling and confirmations can fail if contracts drift.
- 🟡 Team risk: Cross-service ownership increases release coordination needs.
- 🟢 Mitigation: Validate dependencies before release and roll out in stages.

Critical Services (Ranked):
1. Payment
Why it is critical: It supports core transaction execution across flows.
Impact: Customers may not be able to complete purchases.

2. Checkout
Why it is critical: It connects the user journey to downstream execution services.
Impact: Orders may drop before completion.

3. Order
Why it is critical: It finalizes the purchase workflow after checkout.
Impact: Paid orders may not appear correctly.

What Can Break (Blast Radius):
- Payments may fail.
- Orders may not complete.
- Customer confirmations may not arrive.

Why This Is Risky (Technical Insight):
- Shared services have multiple dependents.
- Breaking contracts create fast downstream failures.
- Release order matters when consumers depend on old fields or endpoints.

Recommended Actions:
- Service owner: verify consumers before changing contracts.
- Platform team: inspect dependency graph and run blast radius analysis.
- QA owner: test the full purchase flow before rollout.

Quick Rule / Heuristic:
If a service feeds revenue-critical flows, never ship a breaking change without consumer confirmation."""
        else:
            client = _get_client()
            message = client.messages.create(
                model=MODEL,
                max_tokens=400,
                messages=[{"role": "user", "content": prompt}],
            )
            ai_response = message.content[0].text
        
        logger.info(f"[TEXT AI BROADCAST] ✓ Got AI response: {len(ai_response)} chars")
        
        # CREATE and BROADCAST the response
        ai_msg = ChatMessage(
            id=str(uuid.uuid4()),
            username="Lumen AI",
            user_id="system",
            type=ChatMessageType.system,
            content=ai_response,
            blast_radius=None,
            timestamp=datetime.utcnow().isoformat(),
        )
        
        logger.info(f"[TEXT AI BROADCAST] Creating ChatMessage: {ai_msg.id}")
        chat_store.add_message(ai_msg.model_dump())
        logger.info(f"[TEXT AI BROADCAST] Stored in ChatStore")
        
        logger.info(f"[TEXT AI BROADCAST] Broadcasting to {len(connection_manager.active_connections)} connections")
        await connection_manager.broadcast(ai_msg.model_dump())
        logger.info(f"[TEXT AI BROADCAST] ✓✓✓ AI RESPONSE BROADCASTED SUCCESSFULLY")
        
    except Exception as e:
        logger.error(f"[TEXT AI BROADCAST] ✗ FATAL ERROR: {e}", exc_info=True)
