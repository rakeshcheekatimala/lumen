import { useState } from 'react'
import { ScanSearch, FolderOpen, Loader2, CheckCircle2, AlertCircle, ChevronRight, Zap, Brain, Layers } from 'lucide-react'
import clsx from 'clsx'
import { ingestRepo } from '../api/client'
import type { RepoIngestResponse } from '../types'

type Strategy = 'static' | 'ai' | 'both'

const STRATEGIES: { id: Strategy; label: string; icon: typeof Zap; desc: string }[] = [
  { id: 'static', label: 'Static', icon: Zap, desc: 'Regex patterns — fast, deterministic' },
  { id: 'ai',     label: 'AI',     icon: Brain, desc: 'Claude reads files — slower, smarter' },
  { id: 'both',   label: 'Both',   icon: Layers, desc: 'Merge static + AI (recommended)' },
]

interface Props {
  onGraphUpdated: () => void
}

export default function RepoScanner({ onGraphUpdated }: Props) {
  const [repoPath, setRepoPath] = useState('')
  const [strategy, setStrategy] = useState<Strategy>('both')
  const [resetGraph, setResetGraph] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<RepoIngestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleScan = async () => {
    if (!repoPath.trim()) return
    setScanning(true)
    setResult(null)
    setError(null)

    try {
      const data = await ingestRepo(repoPath.trim(), strategy, resetGraph)
      setResult(data)
      onGraphUpdated()
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

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
          <ScanSearch size={18} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-100">Repo Scanner</h2>
          <p className="text-xs text-slate-500">Scan any repository and auto-build its dependency graph</p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-[#0d1526] border border-[#1e2d45] rounded-xl p-4 space-y-2">
        <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-3">How it works</div>
        {[
          { step: '1', label: 'Service Discovery', detail: 'docker-compose, k8s manifests, Dockerfiles' },
          { step: '2', label: 'Call Detection', detail: 'HTTP clients, gRPC dials, Kafka topics, env vars' },
          { step: '3', label: 'AI Enhancement', detail: 'Claude reads key files to fill gaps' },
          { step: '4', label: 'Graph Load', detail: 'Services + edges appear in the Graph view instantly' },
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
        {/* Path input */}
        <div className="space-y-1.5">
          <label className="text-[11px] text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <FolderOpen size={11} /> Repository Path
          </label>
          <input
            type="text"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="/absolute/path/to/your/repo"
            className="w-full bg-[#080c14] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/60 font-mono"
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
          />
          <p className="text-[10px] text-slate-600">Must be an absolute path accessible to the backend server</p>
        </div>

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

        {/* Reset toggle */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <div
            onClick={() => setResetGraph((v) => !v)}
            className={clsx(
              'w-9 h-5 rounded-full border transition-colors relative',
              resetGraph
                ? 'bg-violet-500/30 border-violet-500/50'
                : 'bg-slate-800 border-slate-600',
            )}
          >
            <div className={clsx(
              'absolute top-0.5 w-4 h-4 rounded-full transition-all',
              resetGraph ? 'left-4 bg-violet-400' : 'left-0.5 bg-slate-500',
            )} />
          </div>
          <div>
            <span className="text-xs text-slate-300">Reset graph before loading</span>
            <p className="text-[10px] text-slate-600">Clears existing services and starts fresh from scanned repo</p>
          </div>
        </label>

        {/* Scan button */}
        <button
          onClick={handleScan}
          disabled={scanning || !repoPath.trim()}
          className={clsx(
            'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
            scanning || !repoPath.trim()
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-violet-600 hover:bg-violet-500 text-white',
          )}
        >
          {scanning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Scanning…
            </>
          ) : (
            <>
              <ScanSearch size={14} />
              Scan Repository
            </>
          )}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-[#0d1526] border border-green-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-400" />
            <span className="text-sm font-medium text-green-300">Scan complete</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Services found', value: result.services_added },
              { label: 'Edges detected', value: result.edges_added },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[#080c14] rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-slate-100">{value}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
          {result.summary && (
            <p className="text-xs text-slate-400 leading-relaxed border-t border-[#1e2d45] pt-3">
              {result.summary}
            </p>
          )}
          <button
            onClick={() => {/* parent already refreshed graph */}}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            Switch to Graph view to explore <ChevronRight size={12} />
          </button>
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
