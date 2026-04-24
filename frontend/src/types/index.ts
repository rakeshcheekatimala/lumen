export interface FieldModel {
  name: string
  type: string
  required: boolean
  description: string
}

export interface EndpointModel {
  id: string
  path: string
  method: string
  description: string
  request_fields: FieldModel[]
  response_fields: FieldModel[]
}

export interface ServiceNode {
  id: string
  name: string
  language: string
  team: string
  description: string
  port: number
  endpoints: EndpointModel[]
  risk_score: number
  node_type?: string  // "internal" | "external"
}

export interface ServiceEdge {
  source: string
  target: string
  protocol: string
  endpoints_called: string[]
  label: string
}

export interface DependencyGraph {
  services: ServiceNode[]
  edges: ServiceEdge[]
}

export interface ImpactedService {
  service_id: string
  service_name: string
  team: string
  depth: number
  impact_type: string
  affected_endpoints: string[]
  risk_level: 'critical' | 'high' | 'medium' | 'low'
}

export interface ChangeRequest {
  service_id: string
  endpoint_id: string
  change_type: 'field_removed' | 'field_type_changed' | 'endpoint_removed' | 'field_added'
  field_name?: string
  description?: string
}

export interface BlastRadiusResult {
  changed_service: string
  changed_service_name: string
  changed_endpoint: string
  change_type: string
  impacted_services: ImpactedService[]
  total_impacted: number
  risk_level: 'critical' | 'high' | 'medium' | 'low'
  ai_analysis?: string
  ai_mode?: string   // "real" | "mock" | "none"
  propagation_paths: string[][]
}

export interface RCARequest {
  incident_service: string
  incident_description: string
  symptoms: string[]
}

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'none'

export type ViewMode = 'graph' | 'srb' | 'schema-diff' | 'repo-scan'

export interface RepoIngestRequest {
  repo_path: string
  strategy: 'static' | 'ai' | 'both'
  reset_graph: boolean
}

export interface RepoIngestResponse {
  services_added: number
  edges_added: number
  strategy_used: string
  summary: string
  message: string
}

// ─── SRB Autopilot ───────────────────────────────────────────────────────────

export type Protocol = 'sync-grpc' | 'sync-rest' | 'async-kafka' | 'async-sqs'
export type Criticality = 'critical' | 'important' | 'nice-to-have'
export type DataSensitivity = 'none' | 'pii' | 'pci' | 'phi'
export type ChangeType = 'NEW' | 'ENHANCEMENT'
export type Recommendation = 'APPROVE' | 'CONDITIONAL' | 'REJECT'
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface Integration {
  service_id: string
  protocol: Protocol
  criticality: Criticality
  data_flow: string
}

export interface SRBSubmission {
  service_name: string
  team: string
  purpose: string
  change_type: ChangeType
  upstream_callers: Integration[]
  downstream_dependencies: Integration[]
  data_sensitivity: DataSensitivity
  expected_rps: number
  sla_target_ms: number
  deployment: string
}

export interface AntiPattern {
  name: string
  severity: Severity
  description: string
  suggestion: string
  services_involved: string[]
}

export interface SimilarService {
  service_id: string
  service_name: string
  similarity_reason: string
}

export interface SRBValidation {
  submission: SRBSubmission
  risk_score: number
  recommendation: Recommendation
  anti_patterns: AntiPattern[]
  similar_services: SimilarService[]
  missing_elements: string[]
  conditions: string[]
  blast_radius_forecast: {
    new_edges: number
    new_sync_chain_length: number
    teams_involved: string[]
    downstream_count: number
    upstream_count: number
  }
  ai_rationale?: string
}

// ─── Schema Diff ─────────────────────────────────────────────────────────────

export interface SchemaChange {
  change_type: string
  location: string
  old_value?: string | null
  new_value?: string | null
  is_breaking: boolean
  severity: Severity
  reason: string
}

export interface SchemaDiffRequest {
  old_spec: string
  new_spec: string
  service_id?: string
}

export interface SchemaDiffResult {
  changes: SchemaChange[]
  breaking_count: number
  total_count: number
  service_id?: string | null
  blast_radius?: BlastRadiusResult | null
}

export interface PaymentDiffSample {
  old_spec: string
  new_spec: string
  service_id: string
}

// ─── Multi-Repo Ingestion ─────────────────────────────────────────────────────

export interface RepoScanResult {
  repo_path: string
  repo_name: string
  services: ServiceNode[]
  edges: ServiceEdge[]
  error: string | null
}

export interface RepoGroup {
  group_name: string
  repo_names: string[]
  services_count: number
  edges_count: number
  cross_repo_edges_count: number
}

export interface MultiRepoIngestRequest {
  repo_paths: string[]
  strategy: 'static' | 'ai' | 'both'
  reset_graph: boolean
}

export interface MultiRepoIngestResponse {
  repos_scanned: number
  total_services_added: number
  total_edges_added: number
  cross_repo_edges_added: number
  strategy_used: string
  groups: RepoGroup[]
  independent_repos: string[]
  per_repo: RepoScanResult[]
  cross_repo_edges: ServiceEdge[]
  message: string
}
