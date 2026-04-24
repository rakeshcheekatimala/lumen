# Lumen

> **Live Unified Meta Engine** — AI-powered platform for microservices dependency analysis, change impact simulation, and service governance.

---

## What It Does

Lumen ingests your microservices topology (via OpenTelemetry traces, OpenAPI specs, or repo scanning) and uses Claude AI to reason about:

- **Dependency Graph** — visual map of which service calls which, with risk scores
- **Change Impact Simulator** — blast radius analysis before you deploy
- **Service Review Board (SRB)** — anti-pattern detection and change governance
- **Schema Diff** — breaking change detection between OpenAPI spec versions
- **Repo Scanner** — auto-discover services, dependencies, and config maps from source code

---

## Architecture

```
┌─────────────────────────────────────────┐
│  React + TypeScript + Vite (port 3000)  │
│  DependencyGraph · Simulator · SRB      │
│  SchemaDiff · RepoScanner               │
└────────────────┬────────────────────────┘
                 │ /api (proxied)
┌────────────────▼────────────────────────┐
│  FastAPI (port 8000)                    │
│  graph/  · ai/  · ingestion/            │
│  In-memory networkx DiGraph singleton   │
└────────────────┬────────────────────────┘
                 │
         ┌───────▼────────┐
         │  Claude API    │
         │  (Anthropic)   │
         └────────────────┘
```

**Backend modules:**
| Module | Responsibility |
|--------|---------------|
| `graph/builder.py` | Graph singleton, OTEL demo topology |
| `graph/analyzer.py` | Blast radius, RCA algorithms |
| `graph/srb_analyzer.py` | Anti-pattern detection |
| `graph/schema_diff.py` | OpenAPI semantic diff |
| `ai/claude_analyzer.py` | Claude AI wrapper with mock fallback |
| `ingestion/repo_scanner.py` | Repo-based service discovery |
| `ingestion/swagger_parser.py` | OpenAPI → graph nodes |
| `ingestion/otel_traces.py` | OTel trace → graph edges |

---

## Installation

### Prerequisites

- Python 3.13+
- Node.js 18+
- An Anthropic API key (or use `MOCK_AI=true` for offline mode)

### 1. Clone

```bash
git clone <repo-url>
cd hackathon
```

### 2. Install all dependencies

```bash
make install
```

This creates a Python venv at `backend/.venv` and runs `npm install` in `frontend/`.

### 3. Configure environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env:
#   ANTHROPIC_API_KEY=sk-ant-...
#   MOCK_AI=false          # set true to skip API calls
```

### 4. Run dev servers

Open two terminals:

```bash
# Terminal 1 — backend (http://localhost:8000)
make backend

# Terminal 2 — frontend (http://localhost:3000)
make frontend
```

### Docker (optional)

```bash
ANTHROPIC_API_KEY=sk-ant-... docker compose up
```

Both services start; frontend proxies API calls to the backend container.

---

## Usage

| Feature | How to reach it |
|---------|----------------|
| Dependency graph | Default view on load |
| Change simulator | Select a service → click "Simulate Change" |
| Blast radius | Shows automatically on service select |
| SRB submission | Switch to "SRB" tab in the header |
| Schema diff | Switch to "Schema Diff" tab → use sample or paste specs |
| Repo scanner | Switch to "Repo Scanner" tab → enter a local path |

### Offline / demo mode

Set `MOCK_AI=true` in `backend/.env`. All AI endpoints return realistic canned responses — no API key needed.

---

## Status

### Completed

- [x] OTEL demo topology seeded (16 services, realistic edges)
- [x] Dependency graph visualization (`@xyflow/react` + dagre layout)
- [x] Blast radius computation (graph traversal, normalized risk scores)
- [x] Root cause analysis (RCA) graph algorithm
- [x] Change simulator UI with impact summary
- [x] Service Review Board — anti-pattern detection against live graph
- [x] SRB scorecard rendering
- [x] OpenAPI schema diff — breaking change detection
- [x] Sample payment spec diff demo (`/api/samples/payment-diff`)
- [x] Repo scanner — discovers services via code patterns (imports, HTTP clients, env vars)
- [x] ConfigMap / Helm values signal detection in repo scanner
- [x] AI analysis via Claude (`claude-sonnet-4-6`) with mock fallback
- [x] Docker Compose setup
- [x] CORS + API proxy (Vite dev config)

### In Progress

- [ ] Repo scanner UI polish — result grouping and confidence score display
- [ ] Streaming AI responses (currently full-response wait)
- [ ] ConfigMap dependency edges surfaced in the main graph

### Future

- [ ] Persistent graph storage (PostgreSQL / Redis) — currently in-memory, resets on restart
- [ ] Multi-repo ingestion — scan multiple repos and merge graphs
- [ ] OTel trace live ingestion endpoint (real-time edge discovery)
- [ ] GitHub / GitLab integration — trigger analysis on PR open
- [ ] Slack / PagerDuty alerts when blast radius exceeds threshold
- [ ] RBAC — service ownership + approval workflows for SRB
- [ ] Graph diffing between deploys (topology drift detection)
- [ ] Export graph as JSON / Mermaid / draw.io

---

## Development Notes

- Graph is **in-memory only** — restart resets to OTEL demo topology
- CORS is wide open (`allow_origins=["*"]`) — tighten before any real deployment
- AI calls are the slow path; most endpoints accept `?include_ai=false` to skip them
- Model ID hardcoded in `ai/claude_analyzer.py` — update there to upgrade Sonnet version
- No test suite yet — pytest (backend) and Playwright (frontend E2E) are the intended frameworks

---

## Contributing

1. `make install` to set up deps
2. Run backend + frontend in dev mode
3. Follow conventional commits (`feat:`, `fix:`, `chore:`, etc.)
4. Open a PR with a description of what changed and why
