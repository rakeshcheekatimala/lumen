"""
Claude-powered microservice topology extraction from a repository.
Feeds key files to Claude → returns structured service graph JSON.
Complements repo_scanner.py (catches what regex misses).
"""
import os
import json
from pathlib import Path
from anthropic import Anthropic
from graph.models import ServiceNode, ServiceEdge

MOCK_AI = os.environ.get("MOCK_AI", "false").lower() == "true"
MODEL = "claude-sonnet-4-6"

_client: Anthropic | None = None

_SKIP_DIRS = frozenset({
    "node_modules", ".git", "vendor", "venv", ".venv", "__pycache__",
    "dist", "build", ".next", "target", ".gradle", "coverage",
})

_CONFIG_GLOBS = [
    "docker-compose*.yml", "docker-compose*.yaml",
    "*.dockerfile", "Makefile",
    "requirements.txt", "go.mod", "go.sum",
    "package.json", "pom.xml", "build.gradle",
    "Cargo.toml", "Gemfile",
]

_CODE_EXT = frozenset({".py", ".go", ".ts", ".js", ".java", ".kt", ".rs", ".rb", ".php", ".cs"})

# Files with these names are highest-signal for dependency detection
_HIGH_SIGNAL_NAMES = frozenset({
    "main.py", "app.py", "server.py", "service.py",
    "main.go", "server.go", "client.go",
    "index.ts", "index.js", "app.ts", "server.ts",
    "Main.java", "Application.java",
    "main.rs",
    "docker-compose.yml", "docker-compose.yaml",
})


def _get_client() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    return _client


def _collect_files(repo: Path, max_files: int = 25, max_lines: int = 100) -> list[dict]:
    """Collect the highest-signal files for Claude to analyze."""
    buckets: list[tuple[int, Path]] = []  # (priority, path)

    # Priority 0: config files
    for glob in _CONFIG_GLOBS:
        for f in repo.rglob(glob):
            if not any(p in _SKIP_DIRS for p in f.parts):
                buckets.append((0, f))

    # Priority 1: high-signal named source files
    for f in repo.rglob("*"):
        if f.is_file() and f.name in _HIGH_SIGNAL_NAMES:
            if not any(p in _SKIP_DIRS for p in f.parts):
                buckets.append((1, f))

    # Priority 2: other source files (client files, api files)
    for f in repo.rglob("*"):
        if not f.is_file() or any(p in _SKIP_DIRS for p in f.parts):
            continue
        if f.suffix not in _CODE_EXT:
            continue
        name_lower = f.name.lower()
        if any(kw in name_lower for kw in ("client", "api", "grpc", "kafka", "service", "http")):
            buckets.append((2, f))

    buckets.sort(key=lambda x: x[0])
    seen: set[Path] = set()
    result = []

    for _, f in buckets:
        if f in seen or len(result) >= max_files:
            break
        seen.add(f)
        try:
            lines = f.read_text(errors="replace").splitlines()[:max_lines]
            result.append({
                "path": str(f.relative_to(repo)),
                "content": "\n".join(lines),
            })
        except Exception:
            pass

    return result


def _mock_result(repo_name: str) -> dict:
    return {
        "services": [
            {"id": "api-gateway", "name": "API Gateway", "language": "Go",
             "team": "platform", "description": "Entry point for all clients"},
            {"id": "user-service", "name": "User Service", "language": "Python",
             "team": "backend", "description": "User management and auth"},
            {"id": "order-service", "name": "Order Service", "language": "Java",
             "team": "orders", "description": "Order processing"},
            {"id": "notification-service", "name": "Notification Service", "language": "TypeScript",
             "team": "platform", "description": "Email and push notifications"},
        ],
        "edges": [
            {"source": "api-gateway", "target": "user-service", "protocol": "http"},
            {"source": "api-gateway", "target": "order-service", "protocol": "http"},
            {"source": "order-service", "target": "user-service", "protocol": "grpc"},
            {"source": "order-service", "target": "notification-service", "protocol": "kafka"},
        ],
        "summary": f"Mock analysis of '{repo_name}'. Set MOCK_AI=false + ANTHROPIC_API_KEY for real analysis.",
    }


def analyze_repo(repo_path: str, org_context: str = "") -> dict:
    """
    Feed key repository files to Claude and extract the microservice topology.

    Returns:
        {
          "services": [{"id", "name", "language", "team", "description", "node_type"}, ...],
          "edges":    [{"source", "target", "protocol", "label"}, ...],
          "summary":  "architecture summary string"
        }
    """
    repo = Path(repo_path).resolve()

    if MOCK_AI:
        return _mock_result(repo.name)

    files = _collect_files(repo)
    if not files:
        return {"services": [], "edges": [], "summary": "No source files found."}

    file_block = "\n\n".join(
        f"### {f['path']}\n```\n{f['content']}\n```"
        for f in files
    )

    org_section = f"\n{org_context}\n" if org_context else ""

    prompt = f"""You are an expert software architect analyzing a microservices repository.{org_section}

Analyze the source files below and extract the complete microservice topology.

## Repository: {repo.name}

## Source Files
{file_block}

## Task
Identify:
1. Every distinct microservice / application
2. Every dependency edge (which service calls / consumes which)

Evidence to look for (internal services):
- docker-compose service definitions and `depends_on`
- HTTP client calls (requests, axios, fetch, RestTemplate, http.Get)
- gRPC dial / channel creation
- Kafka producer/consumer topic names
- @FeignClient annotations
- Environment variables referencing other services (PAYMENT_SERVICE_URL, etc.)
- Import of internal client packages (e.g. `import paymentclient`)

Evidence to look for (3rd-party external APIs):
- Calls to external domains: stripe.com, mastercard.com, paypal.com, adyen.com, twilio.com, sendgrid.com, auth0.com, okta.com, sentry.io, datadog.com, etc.
- API key env vars: STRIPE_API_KEY, MPGS_API_KEY, MPGS_API_URL, TWILIO_ACCOUNT_SID, SENDGRID_API_KEY, SENTRY_DSN, etc.
- SDK imports: `import stripe`, `from twilio.rest import Client`, `@FeignClient("mpgs")`, etc.
- Config values pointing to external base URLs

## Output Format
Respond ONLY with valid JSON. No prose before or after.

{{
  "services": [
    {{
      "id": "kebab-case-id",
      "name": "Human Readable Name",
      "language": "Go|Python|TypeScript|Java|Rust|...",
      "team": "team-name or unknown",
      "description": "one sentence about what this service does",
      "node_type": "internal"
    }},
    {{
      "id": "stripe",
      "name": "Stripe",
      "language": "unknown",
      "team": "payment-gateway",
      "description": "3rd-party payment gateway integration",
      "node_type": "external"
    }}
  ],
  "edges": [
    {{
      "source": "caller-service-id",
      "target": "callee-service-id",
      "protocol": "http|grpc|kafka|amqp|unknown",
      "label": "optional context — use 'external' for 3rd-party edges"
    }}
  ],
  "summary": "1-2 sentence architecture summary"
}}

Rules:
- Only include services with clear evidence in the files
- Only include edges with concrete call/dependency evidence
- All service ids must be lowercase and hyphen-separated
- Omit uncertain edges rather than guessing
- For 3rd-party APIs (Stripe, MPGS, Twilio, etc.) use node_type "external", team = category (payment-gateway, messaging, etc.)
- Include the edge from internal service → external API"""

    msg = _get_client().messages.create(
        model=MODEL,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )
    text = msg.content[0].text.strip()

    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        return json.loads(text[start:end])
    except (json.JSONDecodeError, ValueError):
        return {
            "services": [],
            "edges": [],
            "summary": f"Claude response could not be parsed. Raw (first 300 chars): {text[:300]}",
        }


def to_graph_models(ai_result: dict) -> tuple[list[ServiceNode], list[ServiceEdge]]:
    """Convert Claude's JSON output to ServiceNode / ServiceEdge model objects."""
    nodes = []
    for s in ai_result.get("services", []):
        nodes.append(ServiceNode(
            id=s.get("id", "unknown"),
            name=s.get("name", s.get("id", "unknown")),
            language=s.get("language", "unknown"),
            team=s.get("team", "unknown"),
            description=s.get("description", ""),
            node_type=s.get("node_type", "internal"),
        ))

    edges = []
    seen: set[tuple[str, str]] = set()
    node_ids = {n.id for n in nodes}

    for e in ai_result.get("edges", []):
        src, tgt = e.get("source", ""), e.get("target", "")
        if src in node_ids and tgt in node_ids and (src, tgt) not in seen:
            edges.append(ServiceEdge(
                source=src,
                target=tgt,
                protocol=e.get("protocol", "unknown"),
                label=e.get("label", ""),
            ))
            seen.add((src, tgt))

    return nodes, edges
