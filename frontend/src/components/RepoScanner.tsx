import { useState, useMemo } from 'react'
import {
  ScanSearch, FolderOpen, Loader2, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, Zap, Brain, Layers, GripVertical, X, Link2, Package,
} from 'lucide-react'
import clsx from 'clsx'
import { ingestMultipleRepos } from '../api/client'
import type { MultiRepoIngestResponse, RepoGroup, RepoScanResult, ServiceNode, ServiceEdge } from '../types'
import ScanGraph from './ScanGraph'

type Strategy = 'static' | 'ai' | 'both'

interface RepoDraft {
  id: string
  path: string
  manual: boolean
}

const STRATEGIES: { id: Strategy; label: string; icon: typeof Zap; desc: string }[] = [
  { id: 'static', label: 'Static', icon: Zap,    desc: 'Regex patterns — fast, deterministic' },
  { id: 'ai',     label: 'AI',     icon: Brain,   desc: 'Claude reads files — slower, smarter' },
  { id: 'both',   label: 'Both',   icon: Layers,  desc: 'Merge static + AI (recommended)' },
]

export default function RepoScanner() {
  const [basePath, setBasePath]     = useState('')
  const [repoDrafts, setRepoDrafts] = useState<RepoDraft[]>([])
  const [strategy, setStrategy]     = useState<Strategy>('both')
  const [isDragOver, setIsDragOver] = useState(false)
  const [scanning, setScanning]     = useState(false)
  const [result, setResult]         = useState<MultiRepoIngestResponse | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [graphExpanded, setGraphExpanded] = useState(true)

  const composePath = (folderName: string): string => {
    const base = basePath.trim().replace(/\/$/, '')
    return base ? `${base}/${folderName}` : folderName
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => setIsDragOver(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const items = Array.from(e.dataTransfer.items)
    const newDrafts: RepoDraft[] = []

    for (const item of items) {
      const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.()
      if (entry?.isDirectory) {
        const absPath = composePath(entry.name)
        const alreadyAdded = repoDrafts.some((d) => d.path === absPath)
        if (!alreadyAdded) {
          newDrafts.push({ id: crypto.randomUUID(), path: absPath, manual: false })
        }
      }
    }

    if (newDrafts.length > 0) {
      setRepoDrafts((prev) => [...prev, ...newDrafts])
    }
  }

  const handleAddManual = () => {
    setRepoDrafts((prev) => [...prev, { id: crypto.randomUUID(), path: '', manual: true }])
  }

  const handleEditPath = (id: string, newPath: string) => {
    setRepoDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, path: newPath } : d)))
  }

  const handleRemove = (id: string) => {
    setRepoDrafts((prev) => prev.filter((d) => d.id !== id))
  }

  const handleScanAll = async () => {
    const validPaths = repoDrafts.map((d) => d.path.trim()).filter(Boolean)
    if (validPaths.length === 0) return

    setScanning(true)
    setResult(null)
    setError(null)

    try {
      const data = await ingestMultipleRepos(validPaths, strategy, false)
      setResult(data)
      setGraphExpanded(true)
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Scan failed'
      setError(msg)
    } finally {
      setScanning(false)
    }
  }

  // Collect all scanned services + edges (per-repo + cross-repo) for the graph
  const { allServices, allEdges } = useMemo<{ allServices: ServiceNode[]; allEdges: ServiceEdge[] }>(() => {
    if (!result) return { allServices: [], allEdges: [] }
    const seenIds = new Set<string>()
    const services: ServiceNode[] = []
    for (const r of result.per_repo) {
      for (const svc of r.services) {
        if (!seenIds.has(svc.id)) {
          seenIds.add(svc.id)
          services.push(svc)
        }
      }
    }
    const seenEdges = new Set<string>()
    const edges: ServiceEdge[] = []
    for (const r of result.per_repo) {
      for (const e of r.edges) {
        const key = `${e.source}→${e.target}`
        if (!seenEdges.has(key)) {
          seenEdges.add(key)
          edges.push(e)
        }
      }
    }
    for (const e of (result.cross_repo_edges ?? [])) {
      const key = `${e.source}→${e.target}`
      if (!seenEdges.has(key)) {
        seenEdges.add(key)
        edges.push(e)
      }
    }
    return { allServices: services, allEdges: edges }
  }, [result])

  const validCount = repoDrafts.filter((d) => d.path.trim()).length

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
          <ScanSearch size={18} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-100">Multi-Repo Scanner</h2>
          <p className="text-xs text-slate-500">Scan multiple repos at once — detect cross-repo dependencies</p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-[#0d1526] border border-[#1e2d45] rounded-xl p-4 space-y-2">
        <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-3">How it works</div>
        {[
          { step: '1', label: 'Service Discovery', detail: 'docker-compose, k8s manifests, Dockerfiles' },
          { step: '2', label: 'Call Detection',    detail: 'HTTP clients, gRPC dials, Kafka topics, env vars' },
          { step: '3', label: 'Cross-Repo Linking', detail: 'Edges that span repos are detected and labeled' },
          { step: '4', label: 'Graph Render',       detail: 'Topology visualised below scan results' },
        ].map(({ step, label, detail }) => (
          <div key={step} className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-[10px] text-violet-300 font-bold">{step}</span>
            </div>
            <div>
              <span className="text-xs text-slate-300 font-medium">{label}</span>
              <span className="text-[11px] text-slate-500 ml-2">{detail}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Config */}
      <div className="bg-[#0d1526] border border-[#1e2d45] rounded-xl p-4 space-y-4">
        {/* Base path */}
        <div className="space-y-1.5">
          <label className="text-[11px] text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <FolderOpen size={11} /> Workspace Root
          </label>
          <input
            type="text"
            value={basePath}
            onChange={(e) => setBasePath(e.target.value)}
            placeholder="/Users/you/workspace"
            className="w-full bg-[#080c14] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/60 font-mono"
          />
          <p className="text-[10px] text-slate-600">Dragged folder names are appended here to form absolute paths</p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={clsx(
            'rounded-xl border-2 border-dashed p-6 flex flex-col items-center gap-3 transition-colors',
            isDragOver
              ? 'border-violet-500/60 bg-violet-500/5'
              : 'border-violet-500/20 hover:border-violet-500/40',
          )}
        >
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <FolderOpen size={20} className="text-violet-400" />
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-300">Drop folders here</p>
            <p className="text-[11px] text-slate-600 mt-0.5">Drag from Finder / Explorer (Chromium required)</p>
          </div>
          <button
            onClick={handleAddManual}
            className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
          >
            + Add path manually
          </button>
        </div>

        {/* Repo list */}
        {repoDrafts.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider">
              Repos to scan ({repoDrafts.length})
            </div>
            {repoDrafts.map((draft) => (
              <div
                key={draft.id}
                className="flex items-center gap-2 bg-[#080c14] border border-[#1e2d45] rounded-lg px-3 py-2"
              >
                <GripVertical size={14} className="text-slate-600 shrink-0" />
                {draft.manual || !draft.path ? (
                  <input
                    type="text"
                    value={draft.path}
                    onChange={(e) => handleEditPath(draft.id, e.target.value)}
                    placeholder="/absolute/path/to/repo"
                    autoFocus
                    className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 focus:outline-none font-mono min-w-0"
                  />
                ) : (
                  <span className="flex-1 text-sm text-slate-300 font-mono truncate">{draft.path}</span>
                )}
                <button
                  onClick={() => handleRemove(draft.id)}
                  className="text-slate-600 hover:text-red-400 transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Strategy */}
        <div className="space-y-1.5">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider">Analysis Strategy</div>
          <div className="grid grid-cols-3 gap-2">
            {STRATEGIES.map(({ id, label, icon: Icon, desc }) => (
              <button
                key={id}
                onClick={() => setStrategy(id)}
                className={clsx(
                  'flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-all',
                  strategy === id
                    ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                    : 'border-[#1e2d45] text-slate-400 hover:border-slate-500 hover:text-slate-300',
                )}
              >
                <Icon size={14} />
                <span className="text-xs font-medium">{label}</span>
                <span className="text-[10px] opacity-70 leading-tight">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Scan button */}
        <button
          onClick={handleScanAll}
          disabled={scanning || validCount === 0}
          className={clsx(
            'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
            scanning || validCount === 0
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-violet-600 hover:bg-violet-500 text-white',
          )}
        >
          {scanning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Scanning {validCount} repo{validCount !== 1 ? 's' : ''}…
            </>
          ) : (
            <>
              <ScanSearch size={14} />
              Scan {validCount > 0 ? `${validCount} Repo${validCount !== 1 ? 's' : ''}` : 'Repos'}
            </>
          )}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="bg-[#0d1526] border border-green-500/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-green-400" />
              <span className="text-sm font-medium text-green-300">Scan complete</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Repos',     value: result.repos_scanned },
                { label: 'Services',  value: result.total_services_added },
                { label: 'Edges',     value: result.total_edges_added },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[#080c14] rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-slate-100">{value}</div>
                  <div className="text-[10px] text-slate-500">{label}</div>
                </div>
              ))}
            </div>
            {result.cross_repo_edges_added > 0 && (
              <p className="text-[11px] text-violet-400">
                {result.cross_repo_edges_added} cross-repo connection{result.cross_repo_edges_added !== 1 ? 's' : ''} detected
              </p>
            )}
          </div>

          {/* Scanned topology graph */}
          {allServices.length > 0 && (
            <div className="space-y-0">
              <button
                onClick={() => setGraphExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-[#0d1526] border border-[#1e2d45] rounded-t-xl text-xs text-slate-400 hover:text-slate-300 transition-colors"
              >
                <span className="font-medium uppercase tracking-wider">Scanned Topology</span>
                {graphExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {graphExpanded && (
                <div className="border-x border-b border-[#1e2d45] rounded-b-xl overflow-hidden">
                  <ScanGraph services={allServices} edges={allEdges} />
                </div>
              )}
            </div>
          )}

          {/* Linked groups */}
          {result.groups.map((group: RepoGroup) => (
            <div
              key={group.group_name}
              className="bg-[#0d1526] border border-violet-500/30 rounded-xl p-4 space-y-2"
            >
              <div className="flex items-center gap-2">
                <Link2 size={14} className="text-violet-400" />
                <span className="text-sm font-medium text-violet-300">
                  Linked: {group.group_name}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">{group.repo_names.join(', ')}</p>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  { label: 'Cross-repo', value: group.cross_repo_edges_count },
                  { label: 'Services',   value: group.services_count },
                  { label: 'Edges',      value: group.edges_count },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-[#080c14] rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-slate-100">{value}</div>
                    <div className="text-[10px] text-slate-500">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Independent repos */}
          {result.independent_repos.map((repoName: string) => {
            const perRepo = result.per_repo.find((r: RepoScanResult) => r.repo_name === repoName)
            return (
              <div
                key={repoName}
                className="bg-[#0d1526] border border-[#1e2d45] rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Package size={14} className="text-slate-400" />
                  <span className="text-sm font-medium text-slate-300">Independent: {repoName}</span>
                </div>
                {perRepo && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {[
                      { label: 'Services', value: perRepo.services.length },
                      { label: 'Edges',    value: perRepo.edges.length },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-[#080c14] rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-slate-100">{value}</div>
                        <div className="text-[10px] text-slate-500">{label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Per-repo errors */}
          {result.per_repo.filter((r: RepoScanResult) => r.error).map((r: RepoScanResult) => (
            <div
              key={r.repo_path}
              className="bg-[#0d1526] border border-red-500/30 rounded-xl p-4 flex items-start gap-3"
            >
              <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-red-300">Failed: {r.repo_name}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{r.error}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-[#0d1526] border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-300">Scan failed</p>
            <p className="text-xs text-slate-400 mt-1 font-mono">{error}</p>
          </div>
        </div>
      )}

      {/* Supported signals */}
      <div className="bg-[#0d1526] border border-[#1e2d45] rounded-xl p-4">
        <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-3">Detected Signals</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {[
            'docker-compose depends_on',
            'k8s Deployment manifests',
            'HTTP: requests / axios / fetch',
            'gRPC: grpc.Dial / insecure_channel',
            'Kafka: producer.produce / subscribe',
            'Spring: @FeignClient',
            'Env vars: SERVICE_URL / HOST',
            'AMQP: channel.queue_declare',
            'Helm: Chart.yaml / values.yaml',
            'ConfigMap: env var URLs',
            '3rd-party: Stripe / MPGS / PayPal',
            '3rd-party: Twilio / SendGrid / Auth0',
          ].map((s) => (
            <div key={s} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <div className="w-1 h-1 rounded-full bg-violet-500 shrink-0" />
              {s}
            </div>
          ))}
        </div>
        <div className="text-[11px] text-slate-600 mt-3">
          Languages: Python · Go · TypeScript · JavaScript · Java · Kotlin · Rust · Ruby · PHP · .NET
        </div>
      </div>
    </div>
  )
}
