"""Claude-powered analysis for blast radius, SRB validation, and RCA."""
import os
import logging
import anthropic
logger = logging.getLogger(__name__)

from graph.models import (
    BlastRadiusResult, RCAResult, ChangeRequest, SRBValidation, SchemaDiffResult,
    ServiceNode, ServiceEdge,
)

MOCK_AI = os.environ.get("MOCK_AI", "false").lower() == "true"

logger = logging.getLogger(__name__)

_client: anthropic.Anthropic | None = None

def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    return _client


def _call_claude(fn_name: str, max_tokens: int, messages: list[dict]) -> str:
    """
    Single call site for all Claude API requests.
    Logs prompt size, token usage, stop reason, and response preview.
    """
    prompt_chars = sum(len(m.get("content", "")) for m in messages)
    logger.info(
        "[claude] %s | model=%s | max_tokens=%d | prompt_chars=%d",
        fn_name, MODEL, max_tokens, prompt_chars,
    )

    msg = _get_client().messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        messages=messages,
    )

    text = msg.content[0].text
    usage = msg.usage
    logger.info(
        "[claude] %s | input_tokens=%d | output_tokens=%d | stop=%s | preview=%.120r",
        fn_name,
        usage.input_tokens,
        usage.output_tokens,
        msg.stop_reason,
        text,
    )
    return text

MODEL = "claude-sonnet-4-6"


# ─── Mock responses ───────────────────────────────────────────────────────────

def _mock_blast_radius(result: BlastRadiusResult, change: ChangeRequest) -> str:
    service = result.changed_service_name
    field = change.field_name or "the endpoint"
    impacted = ", ".join(s.service_name for s in result.impacted_services[:3])
    return f"""## What Breaks
Removing `{field}` from **{service}** will cause immediate failures in {impacted or "downstream services"} — all callers that include this field in their request payload will receive a 422 or 500 error.

## Business Impact
Checkout flow will fail end-to-end: users cannot complete purchases. The payment confirmation email will not be sent, and fraud detection will miss transaction events.

## Migration Path
1. **Version the endpoint** — introduce `/v2/Charge` with the new schema alongside the old one
2. **Notify downstream teams** — Checkout (Go), Accounting (.NET) must update their gRPC clients
3. **Deploy in order** — update consumers first, then deprecate `/v1/Charge` after 2 sprints
4. **Feature-flag the cutover** — use Flagd to gradually shift traffic

## Testing Required
- `checkout-service`: update `TestPlaceOrder` integration test
- `fraud-detection`: update Kafka consumer contract test
- `accounting`: update ledger reconciliation test
- Run full regression on payment flow E2E suite

> ⚠️ *This is a mock response. Set `MOCK_AI=false` and add your `ANTHROPIC_API_KEY` for real Claude analysis.*"""


def _mock_rca(incident_service: str) -> str:
    return f"""## Most Likely Root Cause
1. **Upstream dependency failure** — {incident_service} depends on Payment (gRPC) and Currency (gRPC). A timeout or error in either will cascade synchronously.
2. **Kafka consumer lag** — If Fraud Detection's consumer group is lagging, it may be blocking checkpoint commits and causing backpressure.

## Immediate Actions (next 5 minutes)
- Check Payment service health: `kubectl get pods -l app=payment`
- Check error rate in Grafana: filter by `service={incident_service}`
- Look for `DEADLINE_EXCEEDED` or `UNAVAILABLE` in recent spans

## Runbook
1. Open distributed trace for a failing request (Jaeger/Tempo)
2. Find the first span with error status — that's your blast origin
3. Check if the error started after a recent deployment (`kubectl rollout history`)
4. If Payment is down → trigger circuit breaker, return graceful error to users

## Prevention
- Add circuit breakers on all synchronous gRPC calls
- Set SLO alerts on P99 latency per dependency
- Add contract tests between Checkout ↔ Payment schemas

> ⚠️ *This is a mock response. Set `MOCK_AI=false` and add your `ANTHROPIC_API_KEY` for real Claude analysis.*"""


def _mock_srb() -> dict:
    return {
        "anti_patterns": [
            "Synchronous chain: Frontend → Checkout → Payment creates a 3-hop latency path",
            "Checkout service has too many direct dependencies (6 downstream calls in one transaction)",
        ],
        "breaking_changes": [
            "Removing `transaction_id` field breaks idempotency guarantees for retries",
        ],
        "risk_score": 7,
        "risk_justification": "High fan-out from Checkout makes this a critical path change. Any failure propagates to the entire purchase flow.",
        "recommendation": "CONDITIONAL",
        "conditions": [
            "Version the API endpoint before removing old field",
            "Add contract tests between Checkout and Payment teams",
            "Notify Finance team (Accounting service) 2 sprints ahead",
        ],
        "summary": "The proposed change introduces a breaking schema change on a critical payment path. With proper versioning and coordinated rollout it can be approved conditionally. Mock response — enable real Claude for deeper analysis.",
    }


# ─── Org graph knowledge base ─────────────────────────────────────────────────

def format_graph_context(
    services: list[ServiceNode],
    edges: list[ServiceEdge],
    max_services: int = 40,
    max_edges: int = 60,
) -> str:
    """
    Compact text summary of the live org graph, injected into every AI prompt
    so Claude reasons about the full topology — not just the specific service.
    """
    svcs = services[:max_services]
    edgs = edges[:max_edges]

    svc_lines = "\n".join(
        f"  - {s.id} ({s.language}, team:{s.team})"
        + (f" — {s.description[:70]}" if s.description else "")
        for s in svcs
    )
    edge_lines = "\n".join(
        f"  - {e.source} →[{e.protocol}]→ {e.target}"
        + (f" ({e.label})" if e.label else "")
        for e in edgs
    )
    overflow_note = (
        f"\n  … and {len(services) - max_services} more services"
        if len(services) > max_services else ""
    )
    return (
        f"## Live Org Graph ({len(services)} services, {len(edges)} edges)\n"
        f"### Services\n{svc_lines}{overflow_note}\n\n"
        f"### Dependency Edges\n{edge_lines}"
    )


# ─── Public API ───────────────────────────────────────────────────────────────

def _format_impacted(result: BlastRadiusResult) -> str:
    return "\n".join(
        f"  - {s.service_name} (Team: {s.team}, Depth: {s.depth}, "
        f"Endpoints: {', '.join(s.affected_endpoints[:3]) or 'all endpoints'})"
        for s in result.impacted_services
    )


def analyze_blast_radius(
    result: BlastRadiusResult,
    change: ChangeRequest,
    graph_context: str = "",
) -> str:
    if MOCK_AI:
        logger.info(f"[ANALYZER] Using mock response")
        return _mock_blast_radius(result, change)

    impacted_text = _format_impacted(result)
    prompt = f"""You are an expert platform architect analyzing the impact of a microservice change.

{graph_context}

## Change Details
- **Service**: {result.changed_service_name}
- **Endpoint**: {result.changed_endpoint}
- **Change Type**: {change.change_type.replace("_", " ").title()}
- **Field Changed**: {change.field_name or "N/A"}
- **Description**: {change.description or "No description provided"}

## Blast Radius ({result.total_impacted} impacted services)
{impacted_text if impacted_text else "No downstream services impacted."}

## Overall Risk Level: {result.risk_level.upper()}

Using the full org graph context above, provide a concise analysis:
1. **What breaks**: Which integrations fail and why (reference specific services from the graph)
2. **Business impact**: Which user-facing flows are affected (trace the dependency chain)
3. **Migration path**: Step-by-step fix — considering all teams in the blast radius
4. **Testing required**: Which test suites must be updated

Format with clear headings. Be specific, actionable, under 300 words."""

    return _call_claude("analyze_blast_radius", 600, [{"role": "user", "content": prompt}])


def analyze_rca(
    rca: RCAResult,
    request_description: str,
    incident_service: str,
    graph_context: str = "",
) -> str:
    if MOCK_AI:
        return _mock_rca(incident_service)

    candidates = "\n".join(
        f"  - {c['service_name']} (Team: {c['team']}, Protocol: {c['protocol']}, "
        f"Probability: {int(c['candidate_probability']*100)}%)"
        for c in rca.root_cause_candidates
    )
    prompt = f"""You are an SRE on-call analyzing a production incident.

{graph_context}

## Incident
- **Affected Service**: {incident_service}
- **Description**: {request_description}

## Upstream Dependencies (potential root causes)
{candidates or "No upstream dependencies found."}

## Also Impacted Downstream
{len(rca.blast_radius)} additional services affected.

Using the full org graph above, provide a rapid RCA:
1. **Most Likely Root Cause**: Top 2 candidates with reasoning (reference the dependency chain)
2. **Immediate Actions**: What to check in the next 5 minutes
3. **Runbook**: Step-by-step investigation order (consider all dependent services)
4. **Prevention**: How to prevent this class of incident

Be direct and actionable. Under 250 words."""

    return _call_claude("analyze_rca", 500, [{"role": "user", "content": prompt}])


# ─── SRB narrative rationale ──────────────────────────────────────────────────

def _mock_srb_rationale(v: SRBValidation) -> str:
    s = v.submission
    pattern_summary = "\n".join(f"- **{p.name}** ({p.severity}): {p.description}" for p in v.anti_patterns) or "- No anti-patterns detected."
    return f"""## Proposal: {s.service_name}
A new service proposed by the **{s.team}** team. Purpose: {s.purpose or '(not specified)'}.

## Assessment
Risk score: **{v.risk_score}/10** — recommendation: **{v.recommendation}**.
This proposal integrates with {len(s.upstream_callers)} upstream caller(s) and {len(s.downstream_dependencies)} downstream service(s), spanning {len(v.blast_radius_forecast.get("teams_involved", []))} teams.

## Anti-Patterns Found
{pattern_summary}

## Rationale
{"This proposal should not proceed as-is. The critical issues above must be resolved." if v.recommendation == "REJECT" else
 "This proposal is viable with the conditions attached. Most concerns are addressable with minor design changes." if v.recommendation == "CONDITIONAL" else
 "This proposal follows established patterns and poses low risk to the existing architecture."}

## Recommendation
{"Return to the submitter with required changes before next review cycle." if v.recommendation != "APPROVE" else "Approve and proceed to implementation."}

> ⚠️ *Mock response — set `MOCK_AI=false` + `ANTHROPIC_API_KEY` for real Claude analysis.*"""


def analyze_srb(v: SRBValidation, graph_context: str = "") -> str:
    if MOCK_AI:
        return _mock_srb_rationale(v)

    s = v.submission
    patterns = "\n".join(
        f"- {p.name} ({p.severity}): {p.description} → {p.suggestion}"
        for p in v.anti_patterns
    ) or "None."
    missing = "\n".join(f"- {m}" for m in v.missing_elements) or "None."
    similar = "\n".join(f"- {sim.service_name}: {sim.similarity_reason}" for sim in v.similar_services) or "None."

    up = ", ".join(f"{i.service_id} ({i.protocol})" for i in s.upstream_callers) or "none"
    down = ", ".join(f"{i.service_id} ({i.protocol})" for i in s.downstream_dependencies) or "none"

    prompt = f"""You are a principal architect reviewing a System Review Board (SRB) submission.

{graph_context}

## Proposal
- **Service**: {s.service_name}
- **Team**: {s.team}
- **Purpose**: {s.purpose}
- **Change type**: {s.change_type}
- **Upstream callers**: {up}
- **Downstream dependencies**: {down}
- **Data sensitivity**: {s.data_sensitivity}
- **Expected RPS**: {s.expected_rps}
- **SLA target**: {s.sla_target_ms}ms

## Graph-Detected Anti-Patterns
{patterns}

## Missing Elements
{missing}

## Similar Existing Services (reuse candidates)
{similar}

## Computed Risk: {v.risk_score}/10 — Recommendation: {v.recommendation}

Using the full org graph context above, write a concise architect's rationale (under 250 words):
1. **Overall assessment** — viability and main concerns given the existing topology
2. **Blast radius implications** — which existing services/teams are affected
3. **Recommendation rationale** — why APPROVE/CONDITIONAL/REJECT

Format with clear markdown headings. Be direct and specific."""

    return _call_claude("analyze_srb", 600, [{"role": "user", "content": prompt}])


# ─── Schema diff narrative ────────────────────────────────────────────────────

def _mock_schema_diff_narrative(result: SchemaDiffResult) -> str:
    breaking = [c for c in result.changes if c.is_breaking]
    non_breaking = [c for c in result.changes if not c.is_breaking]
    breaking_list = "\n".join(f"- `{c.location}` — {c.reason}" for c in breaking[:5]) or "- None"
    return f"""## Schema Diff Summary
**{result.breaking_count} breaking** out of **{result.total_count}** total changes.

## Breaking Changes
{breaking_list}

## Non-Breaking Changes
{len(non_breaking)} additive/relaxation changes — safe to deploy.

## Migration Guidance
{"Do not deploy without consumer coordination. Version the endpoint (e.g. /v2/) and run old + new side-by-side for at least one release cycle." if result.breaking_count > 0 else "Changes are backward-compatible. Safe to deploy."}

> ⚠️ *Mock response — set `MOCK_AI=false` for real Claude analysis.*"""


def analyze_schema_diff(result: SchemaDiffResult, graph_context: str = "") -> str:
    if MOCK_AI:
        return _mock_schema_diff_narrative(result)

    changes_text = "\n".join(
        f"- [{c.severity.upper()}] {c.change_type}: {c.location} — {c.reason}"
        for c in result.changes
    ) or "No changes detected."

    service_note = (
        f"This schema belongs to **{result.service_id}** in the org graph."
        if result.service_id else ""
    )

    prompt = f"""You are an API contract reviewer.

{graph_context}

{service_note}

## Schema Diff
{result.breaking_count} breaking / {result.total_count} total changes.

### Changes
{changes_text}

Using the org graph above, provide migration guidance (under 200 words):
1. **Severity summary** — is this safe to deploy?
2. **Consumer impact** — which callers (from the graph) must update and how
3. **Rollout plan** — versioning, feature flags, deprecation timeline

Be concise and actionable."""

    return _call_claude("analyze_schema_diff", 400, [{"role": "user", "content": prompt}])


# ─── Legacy free-text SRB (kept for old endpoint) ─────────────────────────────

def validate_srb_design(services_summary: str, proposed_change: str, graph_context: str = "") -> dict:
    if MOCK_AI:
        return _mock_srb()

    prompt = f"""You are a senior architect reviewing a System Review Board (SRB) submission.

{graph_context}

## Affected Services Summary
{services_summary}

## Proposed Change
{proposed_change}

Review for:
1. **Anti-patterns**: Circular dependencies, chatty interfaces, shared databases
2. **Breaking changes**: API compatibility issues
3. **Risk score**: 1-10 with justification
4. **Approval recommendation**: APPROVE / CONDITIONAL / REJECT

Respond in JSON format:
{{
  "anti_patterns": ["list of issues found"],
  "breaking_changes": ["list of breaking changes"],
  "risk_score": 7,
  "risk_justification": "explanation",
  "recommendation": "CONDITIONAL",
  "conditions": ["required changes before approval"],
  "summary": "one paragraph summary"
}}"""

    import json
    text = _call_claude("validate_srb_design", 800, [{"role": "user", "content": prompt}])
    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        return json.loads(text[start:end])
    except (json.JSONDecodeError, ValueError):
        return {"summary": text, "risk_score": 5, "recommendation": "REVIEW"}
