from pydantic import BaseModel
from typing import Optional


class FieldModel(BaseModel):
    name: str
    type: str
    required: bool
    description: str = ""


class EndpointModel(BaseModel):
    id: str
    path: str
    method: str
    description: str = ""
    request_fields: list[FieldModel] = []
    response_fields: list[FieldModel] = []


class ServiceNode(BaseModel):
    id: str
    name: str
    language: str
    team: str
    description: str = ""
    port: int = 8080
    endpoints: list[EndpointModel] = []
    risk_score: float = 0.0  # 0-1


class ServiceEdge(BaseModel):
    source: str
    target: str
    protocol: str  # grpc, http, kafka
    endpoints_called: list[str] = []
    label: str = ""


class DependencyGraph(BaseModel):
    services: list[ServiceNode]
    edges: list[ServiceEdge]


class ImpactedService(BaseModel):
    service_id: str
    service_name: str
    team: str
    depth: int  # 1 = direct consumer, 2 = indirect, etc.
    impact_type: str  # direct, transitive
    affected_endpoints: list[str] = []
    risk_level: str  # critical, high, medium, low


class ChangeRequest(BaseModel):
    service_id: str
    endpoint_id: str
    change_type: str  # field_removed, field_type_changed, endpoint_removed, field_added
    field_name: Optional[str] = None
    description: str = ""


class BlastRadiusResult(BaseModel):
    changed_service: str
    changed_service_name: str
    changed_endpoint: str
    change_type: str
    impacted_services: list[ImpactedService]
    total_impacted: int
    risk_level: str  # critical, high, medium, low
    ai_analysis: Optional[str] = None
    propagation_paths: list[list[str]] = []


class RCARequest(BaseModel):
    incident_service: str
    incident_description: str
    symptoms: list[str] = []


class RCAResult(BaseModel):
    root_cause_candidates: list[dict]
    blast_radius: list[ImpactedService]
    ai_analysis: str
    recommended_actions: list[str]


# ─── SRB Autopilot ────────────────────────────────────────────────────────────

class Integration(BaseModel):
    service_id: str               # existing service id, or "NEW"
    protocol: str                 # sync-grpc | sync-rest | async-kafka | async-sqs
    criticality: str = "important"  # critical | important | nice-to-have
    data_flow: str = ""           # what data is exchanged


class SRBSubmission(BaseModel):
    service_name: str
    team: str
    purpose: str
    change_type: str = "NEW"      # NEW | ENHANCEMENT
    upstream_callers: list[Integration] = []     # who calls me
    downstream_dependencies: list[Integration] = []  # who I call
    data_sensitivity: str = "none"  # none | pii | pci | phi
    expected_rps: int = 0
    sla_target_ms: int = 500
    deployment: str = "k8s"


class AntiPattern(BaseModel):
    name: str
    severity: str                 # critical | high | medium | low
    description: str
    suggestion: str
    services_involved: list[str] = []


class SimilarService(BaseModel):
    service_id: str
    service_name: str
    similarity_reason: str


class SRBValidation(BaseModel):
    submission: SRBSubmission
    risk_score: int               # 1-10
    recommendation: str           # APPROVE | CONDITIONAL | REJECT
    anti_patterns: list[AntiPattern]
    similar_services: list[SimilarService]
    missing_elements: list[str]
    conditions: list[str]
    blast_radius_forecast: dict   # { added_hops: int, new_sync_chain_length: int, teams_involved: [...] }
    ai_rationale: Optional[str] = None


# ─── Schema Diff ──────────────────────────────────────────────────────────────

class SchemaChange(BaseModel):
    change_type: str              # field_removed | field_added | type_changed | required_changed | endpoint_removed | endpoint_added
    location: str                 # e.g. "POST /Charge → request.credit_card.cvv"
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    is_breaking: bool
    severity: str                 # critical | high | medium | low | info
    reason: str


class SchemaDiffRequest(BaseModel):
    old_spec: str                 # raw YAML/JSON
    new_spec: str
    service_id: Optional[str] = None  # link to existing service for blast radius


class SchemaDiffResult(BaseModel):
    changes: list[SchemaChange]
    breaking_count: int
    total_count: int
    service_id: Optional[str] = None
    blast_radius: Optional[BlastRadiusResult] = None


# ─── Multi-Repo Ingestion ─────────────────────────────────────────────────────

class MultiRepoIngestRequest(BaseModel):
    repo_paths: list[str]
    strategy: str = "both"
    reset_graph: bool = False


class RepoScanResult(BaseModel):
    repo_path: str
    repo_name: str
    services: list[ServiceNode]
    edges: list[ServiceEdge]
    error: Optional[str] = None


class RepoGroup(BaseModel):
    group_name: str
    repo_names: list[str]
    services_count: int
    edges_count: int
    cross_repo_edges_count: int


class MultiRepoIngestResponse(BaseModel):
    repos_scanned: int
    total_services_added: int
    total_edges_added: int
    cross_repo_edges_added: int
    strategy_used: str
    groups: list[RepoGroup]
    independent_repos: list[str]
    per_repo: list[RepoScanResult]
    message: str
