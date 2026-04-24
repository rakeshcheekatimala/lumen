"""Graph-aware anti-pattern detection and forecasting for SRB submissions."""
import networkx as nx
from graph.models import (
    SRBSubmission, SRBValidation, AntiPattern, SimilarService, Integration,
)
from graph.builder import GraphBuilder

# Domain standards (could be externalized; hardcoded for hackathon)
PAYMENT_MUST_BE_ASYNC = True
FLAGD_STANDARD_TEAMS = {"Checkout", "Payment", "Cart", "Notifications"}


def _find_cycles(submission: SRBSubmission, graph: nx.DiGraph) -> list[list[str]]:
    """Would approving this submission introduce a cycle?"""
    new_node = "__proposed__"
    g = graph.copy()
    g.add_node(new_node)
    # upstream: caller → me
    for up in submission.upstream_callers:
        if up.service_id in graph:
            g.add_edge(up.service_id, new_node)
    # downstream: me → callee
    for down in submission.downstream_dependencies:
        if down.service_id in graph:
            g.add_edge(new_node, down.service_id)
    try:
        cycles = list(nx.simple_cycles(g))
        return [c for c in cycles if new_node in c]
    except nx.NetworkXNoCycle:
        return []


def _teams_involved(submission: SRBSubmission, builder: GraphBuilder) -> set[str]:
    teams = {submission.team}
    for integ in submission.upstream_callers + submission.downstream_dependencies:
        svc = builder.services.get(integ.service_id)
        if svc:
            teams.add(svc.team)
    return teams


def _find_similar(submission: SRBSubmission, builder: GraphBuilder) -> list[SimilarService]:
    """Keyword-overlap similarity against existing service descriptions."""
    keywords = set(submission.purpose.lower().split()) | set(submission.service_name.lower().split())
    keywords = {k for k in keywords if len(k) > 3}
    if not keywords:
        return []

    matches = []
    for svc in builder.services.values():
        desc_words = set((svc.description + " " + svc.name).lower().split())
        overlap = keywords & desc_words
        if len(overlap) >= 2:
            matches.append(SimilarService(
                service_id=svc.id,
                service_name=svc.name,
                similarity_reason=f"Shared concepts: {', '.join(list(overlap)[:3])}",
            ))
    return matches[:3]


def detect_anti_patterns(submission: SRBSubmission, builder: GraphBuilder) -> list[AntiPattern]:
    graph = builder.graph
    services = builder.services
    patterns: list[AntiPattern] = []

    # 1. Circular dependency
    cycles = _find_cycles(submission, graph)
    if cycles:
        readable = [
            " → ".join(services[s].name if s in services else s for s in cycle)
            for cycle in cycles[:2]
        ]
        patterns.append(AntiPattern(
            name="Circular Dependency",
            severity="critical",
            description=f"Approving this creates a cycle: {'; '.join(readable)}",
            suggestion="Break the cycle with async events (Kafka) or introduce an intermediary service.",
            services_involved=[s for cycle in cycles for s in cycle if s != "__proposed__"],
        ))

    # 2. Hotspot amplification — calling services that already have many dependents
    for integ in submission.downstream_dependencies:
        svc = services.get(integ.service_id)
        if not svc:
            continue
        in_degree = graph.in_degree(integ.service_id)
        if in_degree >= 5:
            patterns.append(AntiPattern(
                name="Hotspot Amplification",
                severity="high",
                description=f"{svc.name} already has {in_degree} dependents. Adding yours makes it a wider SPOF.",
                suggestion=f"Consider consuming {svc.name} events asynchronously or caching its data.",
                services_involved=[integ.service_id],
            ))

    # 3. Team fan-out — integrations span many teams
    teams = _teams_involved(submission, builder)
    if len(teams) > 4:
        patterns.append(AntiPattern(
            name="Excessive Team Coupling",
            severity="high",
            description=f"This change requires coordination across {len(teams)} teams: {', '.join(sorted(teams))}.",
            suggestion="Reduce integration surface or split the proposal into smaller phased rollouts.",
            services_involved=[],
        ))

    # 4. God service — too many downstream dependencies
    if len(submission.downstream_dependencies) > 6:
        patterns.append(AntiPattern(
            name="God Service",
            severity="high",
            description=f"This service calls {len(submission.downstream_dependencies)} downstream services in one transaction.",
            suggestion="Split responsibilities. Services with >6 sync deps correlate with incident frequency.",
            services_involved=[],
        ))

    # 5. Synchronous payment call — policy violation
    for integ in submission.downstream_dependencies:
        if integ.service_id == "payment" and integ.protocol.startswith("sync"):
            patterns.append(AntiPattern(
                name="Synchronous Payment Call",
                severity="critical",
                description="Company standard: Payment interactions must be asynchronous (Kafka) for PCI isolation.",
                suggestion="Publish a PaymentIntent event to Kafka and consume the PaymentResult event.",
                services_involved=["payment"],
            ))

    # 6. Orphan service — no upstream callers
    if submission.change_type == "NEW" and len(submission.upstream_callers) == 0:
        patterns.append(AntiPattern(
            name="Orphan Service",
            severity="medium",
            description="No upstream callers specified. Services without clear consumers often become dead code.",
            suggestion="Identify at least one concrete caller or delay this proposal until demand is validated.",
            services_involved=[],
        ))

    # 7. Protocol mismatch — team convention check
    downstream_teams = {services[i.service_id].team for i in submission.downstream_dependencies if i.service_id in services}
    if "Checkout" in downstream_teams:
        for integ in submission.downstream_dependencies:
            svc = services.get(integ.service_id)
            if svc and svc.team == "Checkout" and integ.protocol == "sync-rest":
                patterns.append(AntiPattern(
                    name="Protocol Mismatch",
                    severity="medium",
                    description=f"Checkout domain standardizes on gRPC. You proposed REST for {svc.name}.",
                    suggestion="Use gRPC to stay consistent with Checkout domain tooling (contracts, tracing).",
                    services_involved=[integ.service_id],
                ))

    return patterns


def detect_missing_elements(submission: SRBSubmission) -> list[str]:
    missing = []
    if submission.sla_target_ms == 0:
        missing.append("SLA target not specified")
    if submission.data_sensitivity == "none" and any(
        i.service_id == "payment" for i in submission.downstream_dependencies
    ):
        missing.append("Calling Payment but data_sensitivity is 'none' — likely should be 'pci'")
    if submission.team in FLAGD_STANDARD_TEAMS:
        has_flagd = any(i.service_id == "flagd" for i in submission.downstream_dependencies)
        if not has_flagd:
            missing.append(f"Team {submission.team} standardizes on Flagd — no feature-flag integration declared")
    if submission.expected_rps == 0:
        missing.append("Expected traffic (RPS) not specified")
    return missing


def forecast_blast_radius(submission: SRBSubmission, builder: GraphBuilder) -> dict:
    """Summarise what the graph looks like if approved."""
    teams = _teams_involved(submission, builder)
    sync_chain = sum(
        1 for i in submission.downstream_dependencies
        if i.protocol.startswith("sync")
    )
    return {
        "new_edges": len(submission.upstream_callers) + len(submission.downstream_dependencies),
        "new_sync_chain_length": sync_chain,
        "teams_involved": sorted(teams),
        "downstream_count": len(submission.downstream_dependencies),
        "upstream_count": len(submission.upstream_callers),
    }


def _risk_score(patterns: list[AntiPattern], missing: list[str]) -> tuple[int, str]:
    score = 2
    for p in patterns:
        if p.severity == "critical":
            score += 3
        elif p.severity == "high":
            score += 2
        elif p.severity == "medium":
            score += 1
    score += min(len(missing), 2)
    score = min(score, 10)

    if score >= 8:
        rec = "REJECT"
    elif score >= 5:
        rec = "CONDITIONAL"
    else:
        rec = "APPROVE"
    return score, rec


def validate_srb(submission: SRBSubmission, builder: GraphBuilder) -> SRBValidation:
    patterns = detect_anti_patterns(submission, builder)
    missing = detect_missing_elements(submission)
    similar = _find_similar(submission, builder)
    forecast = forecast_blast_radius(submission, builder)
    risk_score, recommendation = _risk_score(patterns, missing)

    conditions = []
    for p in patterns:
        if p.severity in ("critical", "high"):
            conditions.append(p.suggestion)
    for m in missing:
        conditions.append(f"Document: {m}")

    return SRBValidation(
        submission=submission,
        risk_score=risk_score,
        recommendation=recommendation,
        anti_patterns=patterns,
        similar_services=similar,
        missing_elements=missing,
        conditions=conditions,
        blast_radius_forecast=forecast,
    )
