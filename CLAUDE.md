# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: ArchIntel

AI-Powered Architectural Intelligence Platform. A FastAPI + React app that models a microservices topology (seeded with the OpenTelemetry demo services) and uses Claude (Anthropic API) to reason about change impact. Built as a hackathon demo.

## Common Commands

Run from the repo root unless noted.

```bash
# First-time install: creates backend venv (Python 3.13) + installs npm deps
make install

# Dev servers (run in separate terminals)
make backend     # uvicorn on :8000 with --reload
make frontend    # vite dev server on :3000, proxies /api -> :8000

# Frontend build / typecheck
cd frontend && npm run build     # runs tsc && vite build
cd frontend && npm run preview

# Docker Compose (requires ANTHROPIC_API_KEY in the shell env)
docker compose up
```

There is **no test suite** yet — don't claim coverage that doesn't exist. If adding tests, use pytest for backend and Playwright for frontend E2E (per global rules).

## Environment

`backend/.env` holds:
- `ANTHROPIC_API_KEY` — required for real Claude analysis
- `MOCK_AI=true` — bypasses the API and returns canned markdown (see `ai/claude_analyzer.py`). Useful for offline demos.

The backend calls model id `claude-sonnet-4-6` (hardcoded in `ai/claude_analyzer.py`). If Anthropic releases a newer Sonnet and the user wants to upgrade, update that constant.

## Architecture

### Backend (`backend/`, FastAPI)

Single-process app with an in-memory singleton graph. No database.

- **`main.py`** — all HTTP routes. Uses a `lifespan` handler to pre-build the graph on startup.
- **`graph/builder.py`** — **source of truth for the demo topology.** `OTEL_SERVICES` and `OTEL_EDGES` are hardcoded lists representing the OpenTelemetry demo (frontend → checkout → payment/cart/email/etc.). `get_graph_builder()` returns a module-level singleton `GraphBuilder` wrapping a `networkx.DiGraph`. Risk scores are normalized in-degree.
- **`graph/models.py`** — all Pydantic request/response DTOs shared between FastAPI and the frontend type definitions. When changing a DTO, mirror the change in `frontend/src/types/index.ts`.
- **`graph/analyzer.py`** — `compute_blast_radius` and `compute_rca` (pure graph algorithms, no AI).
- **`graph/srb_analyzer.py`** — Service Review Board submission validation (anti-pattern detection against the live graph).
- **`graph/schema_diff.py`** — semantic diff between two OpenAPI specs; flags breaking changes.
- **`ai/claude_analyzer.py`** — wraps the Anthropic SDK. Every AI function has a mock fallback gated on `MOCK_AI`; the mocks are intentionally realistic so the UI stays populated without an API key.
- **`ingestion/swagger_parser.py`**, **`ingestion/otel_traces.py`** — turn external artifacts into `ServiceNode`/`ServiceEdge` and push them into the singleton via `builder.add_service_from_spec(...)`.
- **`data/specs/payment-v{1,2}.yaml`** — sample OpenAPI pair used by the `/api/samples/payment-diff` demo button.

Key flow: graph computation is fast and deterministic; AI calls are the slow path and are optional on most endpoints (`include_ai` query param, or separate `/analyze` variants).

### Frontend (`frontend/`, React + TypeScript + Vite + Tailwind)

- **`src/App.tsx`** — top-level layout. Three view modes: `graph` (simulator + dep graph + side panel), `srb` (SRB composer + scorecard), `schema-diff`. View state and all panel state live here, not in context.
- **`src/api/client.ts`** — axios client hitting `/api` (proxied to `:8000` in dev by `vite.config.ts`). When adding a backend route, add a matching helper here.
- **`src/types/index.ts`** — mirrors `backend/graph/models.py`. Keep in sync.
- **`src/components/DependencyGraph.tsx`** — `@xyflow/react` (React Flow) + `@dagrejs/dagre` for auto-layout. Custom node renderer is `ServiceNode.tsx`.

### Notable cross-cutting details

- CORS is wide open (`allow_origins=["*"]`). Fine for a local demo; tighten before any real deployment.
- The graph is **not persistent.** Ingesting a spec mutates the singleton in memory only — a backend restart reverts to the OTEL demo topology.
- Backend endpoints are a mix of REST shapes; several analysis endpoints take `include_ai` / `include_blast_radius` as query params (not body fields). Keep this in mind when wiring new frontend calls.
