"""Claude-powered analysis for blast radius, SRB validation, and RCA."""
import os
import anthropic
from graph.models import BlastRadiusResult, RCAResult, ChangeRequest, SRBValidation, SchemaDiffResult

MOCK_AI = os.environ.get("MOCK_AI", "false").lower() == "true"

_client: anthropic.Anthropic | None = None

def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    return _client

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


# ─── Public API ───────────────────────────────────────────────────────────────

def _format_impacted(result: BlastRadiusResult) -> str:
    return "\n".join(
        f"  - {s.service_name} (Team: {s.team}, Depth: {s.depth}, "
        f"Endpoints: {', '.join(s.affected_endpoints[:3]) or 'all endpoints'})"
        for s in result.impacted_services
    )


def analyze_blast_radius(result: BlastRadiusResult, change: ChangeRequest) -> str:
    if MOCK_AI:
        return _mock_blast_radius(result, change)

    impacted_text = _format_impacted(result)
    prompt = f"""You are an expert platform architect at a large e-commerce company analyzing the impact of a microservice change.

## Change Details
- **Service**: {result.changed_service_name}
- **Endpoint**: {result.changed_endpoint}
- **Change Type**: {change.change_type.replace("_", " ").title()}
- **Field Changed**: {change.field_name or "N/A"}
- **Description**: {change.description or "No description provided"}

## Impacted Services ({result.total_impacted} total)
{impacted_text if impacted_text else "No downstream services impacted."}

## Overall Risk Level: {result.risk_level.upper()}

Please provide a concise analysis with:
1. **What breaks**: Which integrations will fail and why
2. **Business impact**: What user-facing features are affected
3. **Migration path**: Step-by-step fix recommendations
4. **Testing required**: Which test suites must be updated

Format with clear headings. Be specific, actionable, and concise (under 300 words)."""

    message = _get_client().messages.create(
        model=MODEL,
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def analyze_rca(rca: RCAResult, request_description: str, incident_service: str) -> str:
    if MOCK_AI:
        return _mock_rca(incident_service)

    candidates = "\n".join(
        f"  - {c['service_name']} (Team: {c['team']}, Protocol: {c['protocol']}, "
        f"Probability: {int(c['candidate_probability']*100)}%)"
        for c in rca.root_cause_candidates
    )
    prompt = f"""You are an SRE on-call analyzing a production incident.

## Incident
- **Affected Service**: {incident_service}
- **Description**: {request_description}

## Upstream Dependencies (potential root causes)
{candidates or "No upstream dependencies found."}

## Also Impacted (downstream)
{len(rca.blast_radius)} additional services affected.

Provide a rapid RCA analysis with:
1. **Most Likely Root Cause**: Top 2 candidates with reasoning
2. **Immediate Actions**: What to check in the next 5 minutes
3. **Runbook**: Step-by-step investigation order
4. **Prevention**: How to prevent this class of incident

Be direct and actionable. Under 250 words."""

    message = _get_client().messages.create(
        model=MODEL,
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


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


def analyze_srb(v: SRBValidation) -> str:
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

Write a concise architect's rationale (under 250 words) covering:
1. **Overall assessment** — viability and main concerns
2. **Blast radius implications** — what the graph tells us about future impact
3. **Recommendation rationale** — why APPROVE/CONDITIONAL/REJECT

Format with clear markdown headings. Be direct and specific."""

    message = _get_client().messages.create(
        model=MODEL,
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


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


def analyze_schema_diff(result: SchemaDiffResult) -> str:
    if MOCK_AI:
        return _mock_schema_diff_narrative(result)

    changes_text = "\n".join(
        f"- [{c.severity.upper()}] {c.change_type}: {c.location} — {c.reason}"
        for c in result.changes
    ) or "No changes detected."

    prompt = f"""You are an API contract reviewer.

## Schema Diff
{result.breaking_count} breaking / {result.total_count} total changes.

### Changes
{changes_text}

Provide migration guidance (under 200 words):
1. **Severity summary** — is this safe to deploy?
2. **Consumer impact** — which callers must update and how
3. **Rollout plan** — versioning, feature flags, deprecation timeline

Be concise and actionable."""

    message = _get_client().messages.create(
        model=MODEL,
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


# ─── Legacy free-text SRB (kept for old endpoint) ─────────────────────────────

def validate_srb_design(services_summary: str, proposed_change: str) -> dict:
    if MOCK_AI:
        return _mock_srb()

    prompt = f"""You are a senior architect reviewing a System Review Board (SRB) submission.

## Current Architecture
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

    message = _get_client().messages.create(
        model=MODEL,
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}],
    )
    import json
    text = message.content[0].text
    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        return json.loads(text[start:end])
    except (json.JSONDecodeError, ValueError):
        return {"summary": text, "risk_score": 5, "recommendation": "REVIEW"}
