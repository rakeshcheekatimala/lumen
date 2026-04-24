import axios from 'axios'
import type {
  DependencyGraph, ServiceNode, ChangeRequest, BlastRadiusResult, RCARequest,
  SRBSubmission, SRBValidation,
  SchemaDiffRequest, SchemaDiffResult, PaymentDiffSample,
  MultiRepoIngestResponse,
} from '../types'

const api = axios.create({ baseURL: '/api', timeout: 60_000 })

export const fetchGraph = (): Promise<DependencyGraph> =>
  api.get('/graph').then((r) => r.data)

export const fetchServices = (): Promise<ServiceNode[]> =>
  api.get('/services').then((r) => r.data)

export const computeBlastRadius = (change: ChangeRequest): Promise<BlastRadiusResult> =>
  api.post('/blast-radius/analyze', change).then((r) => r.data)

export const computeBlastRadiusFast = (change: ChangeRequest): Promise<BlastRadiusResult> =>
  api.post('/blast-radius', change).then((r) => r.data)

export const runRCA = (request: RCARequest) =>
  api.post('/rca', request).then((r) => r.data)

export const validateSRBLegacy = (proposed_change: string, affected_services: string[]) =>
  api.post('/validate-srb', { proposed_change, affected_services }).then((r) => r.data)

export const validateSRB = (submission: SRBSubmission, includeAI = true): Promise<SRBValidation> =>
  api.post(`/srb/validate?include_ai=${includeAI}`, submission).then((r) => r.data)

export const diffSchemas = (
  request: SchemaDiffRequest,
  includeAI = true,
  includeBlastRadius = true,
): Promise<SchemaDiffResult> =>
  api
    .post(
      `/schema-diff?include_ai=${includeAI}&include_blast_radius=${includeBlastRadius}`,
      request,
    )
    .then((r) => r.data)

export const fetchPaymentDiffSample = (): Promise<PaymentDiffSample> =>
  api.get('/samples/payment-diff').then((r) => r.data)

export const checkHealth = () =>
  api.get('/health').then((r) => r.data)

export const ingestRepo = (
  repo_path: string,
  strategy: 'static' | 'ai' | 'both',
  reset_graph: boolean,
) =>
  api
    .post('/ingest/repo', { repo_path, strategy, reset_graph }, { timeout: 120_000 })
    .then((r) => r.data)

export const ingestMultipleRepos = (
  repo_paths: string[],
  strategy: 'static' | 'ai' | 'both',
  reset_graph: boolean,
): Promise<MultiRepoIngestResponse> =>
  api
    .post('/ingest/repos', { repo_paths, strategy, reset_graph }, { timeout: 240_000 })
    .then((r) => r.data)
