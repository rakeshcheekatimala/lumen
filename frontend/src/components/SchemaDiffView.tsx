import { useState } from 'react'
import { GitCompareArrows, Loader2, FileText, AlertCircle, AlertTriangle, Info, CheckCircle2, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import ReactMarkdown from 'react-markdown'
import type { SchemaDiffResult, SchemaChange, Severity } from '../types'
import { diffSchemas, fetchPaymentDiffSample } from '../api/client'

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'text-red-300 bg-red-500/15 border-red-500/30',
  high: 'text-orange-300 bg-orange-500/15 border-orange-500/30',
  medium: 'text-yellow-300 bg-yellow-500/15 border-yellow-500/30',
  low: 'text-blue-300 bg-blue-500/15 border-blue-500/30',
  info: 'text-slate-300 bg-slate-500/10 border-slate-500/20',
}

const SEVERITY_ICON: Record<Severity, typeof AlertCircle> = {
  critical: AlertCircle,
  high: AlertTriangle,
  medium: AlertTriangle,
  low: Info,
  info: Info,
}

export default function SchemaDiffView() {
  const [oldSpec, setOldSpec] = useState('')
  const [newSpec, setNewSpec] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [result, setResult] = useState<SchemaDiffResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingSample, setLoadingSample] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSample = async () => {
    setLoadingSample(true)
    setError(null)
    try {
      const sample = await fetchPaymentDiffSample()
      setOldSpec(sample.old_spec)
      setNewSpec(sample.new_spec)
      setServiceId(sample.service_id)
    } catch {
      setError('Failed to load sample')
    } finally {
      setLoadingSample(false)
    }
  }

  const runDiff = async () => {
    if (!oldSpec.trim() || !newSpec.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await diffSchemas(
        { old_spec: oldSpec, new_spec: newSpec, service_id: serviceId || undefined },
        true,
        true,
      )
      setResult(res)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Diff failed'
      setError(msg)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setOldSpec('')
    setNewSpec('')
    setServiceId('')
    setResult(null)
    setError(null)
  }

  const breaking = result?.changes.filter((c) => c.is_breaking) ?? []
  const nonBreaking = result?.changes.filter((c) => !c.is_breaking) ?? []

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left: editor */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-[#1e2d45]">
        <div className="p-3 border-b border-[#1e2d45] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitCompareArrows size={14} className="text-cyan-400" />
            <span className="text-sm font-semibold text-slate-100">Schema Diff</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="w-36 bg-[#111827] border border-[#1e2d45] rounded-md px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
              placeholder="service_id (optional)"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
            />
            <button
              onClick={loadSample}
              disabled={loadingSample}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50"
            >
              {loadingSample ? <Loader2 size={10} className="animate-spin" /> : <FileText size={10} />}
              Load Payment v1→v2
            </button>
            <button
              onClick={reset}
              className="text-[11px] px-2 py-1 rounded-md border border-[#1e2d45] text-slate-500 hover:text-slate-300"
            >
              Reset
            </button>
            <button
              onClick={runDiff}
              disabled={!oldSpec.trim() || !newSpec.trim() || loading}
              className={clsx(
                'flex items-center gap-1 text-xs px-3 py-1 rounded-md font-medium transition-all',
                oldSpec.trim() && newSpec.trim() && !loading
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-900'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed',
              )}
            >
              {loading ? <Loader2 size={10} className="animate-spin" /> : <GitCompareArrows size={10} />}
              Run Diff
            </button>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-2 gap-px bg-[#1e2d45] overflow-hidden">
          <SpecPane label="Old spec (v1)" value={oldSpec} onChange={setOldSpec} />
          <SpecPane label="New spec (v2)" value={newSpec} onChange={setNewSpec} />
        </div>
      </div>

      {/* Right: results */}
      <div className="w-[440px] shrink-0 bg-[#0d1526] flex flex-col overflow-hidden">
        <div className="p-3 border-b border-[#1e2d45] flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-100">Results</span>
          {result && (
            <div className="flex items-center gap-2">
              <Badge tone="slate">{result.total_count} total</Badge>
              <Badge tone={result.breaking_count > 0 ? 'red' : 'green'}>
                {result.breaking_count} breaking
              </Badge>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {!result && !error && (
            <div className="text-center text-xs text-slate-500 py-8">
              Paste two OpenAPI specs or load the Payment sample, then run diff.
            </div>
          )}

          {result && result.total_count === 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 size={14} className="text-green-400" />
              <span className="text-xs text-green-300">No schema differences detected.</span>
            </div>
          )}

          {breaking.length > 0 && (
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">
                Breaking ({breaking.length})
              </div>
              <div className="space-y-2">
                {breaking.map((c, i) => <ChangeCard key={i} change={c} />)}
              </div>
            </div>
          )}

          {nonBreaking.length > 0 && (
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">
                Non-breaking ({nonBreaking.length})
              </div>
              <div className="space-y-2">
                {nonBreaking.map((c, i) => <ChangeCard key={i} change={c} />)}
              </div>
            </div>
          )}

          {result?.blast_radius && (
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">
                Impact on live graph
              </div>
              <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-orange-300">
                    {result.blast_radius.total_impacted} service(s) impacted
                  </span>
                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">
                    {result.blast_radius.risk_level} risk
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  {result.blast_radius.impacted_services.map((svc) => (
                    <div
                      key={svc.service_id}
                      className="flex items-center justify-between text-[11px] bg-slate-900/50 rounded px-2 py-1"
                    >
                      <span className="text-slate-200">{svc.service_name}</span>
                      <span className="text-slate-500">D{svc.depth} · {svc.team}</span>
                    </div>
                  ))}
                </div>
              </div>

              {result.blast_radius.ai_analysis && (
                <div className="mt-3">
                  <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Sparkles size={10} className="text-cyan-400" /> AI migration narrative
                  </div>
                  <div className="prose-dark text-xs leading-relaxed">
                    <ReactMarkdown>{result.blast_radius.ai_analysis}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SpecPane({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col bg-[#080c14] overflow-hidden">
      <div className="px-3 py-1.5 text-[11px] text-slate-500 uppercase tracking-wider bg-[#0d1526] border-b border-[#1e2d45]">
        {label}
      </div>
      <textarea
        className="flex-1 bg-[#080c14] text-slate-200 font-mono text-[11px] leading-relaxed p-3 resize-none focus:outline-none"
        placeholder="Paste OpenAPI YAML or JSON…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  )
}

function ChangeCard({ change }: { change: SchemaChange }) {
  const severity = (change.severity as Severity) ?? 'info'
  const style = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.info
  const Icon = SEVERITY_ICON[severity] ?? Info

  return (
    <div className={clsx('rounded-lg border p-2.5', style)}>
      <div className="flex items-start gap-2">
        <Icon size={12} className="mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">
              {change.change_type.replace(/_/g, ' ')}
            </span>
            {change.is_breaking && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/25 text-red-200 uppercase tracking-wider">
                breaking
              </span>
            )}
          </div>
          <div className="text-xs font-mono text-slate-100 mt-1 break-all">{change.location}</div>
          <div className="text-[11px] text-slate-300 mt-1">{change.reason}</div>
          {(change.old_value || change.new_value) && (
            <div className="text-[10px] font-mono text-slate-400 mt-1.5 space-y-0.5">
              {change.old_value != null && <div>− {change.old_value}</div>}
              {change.new_value != null && <div>+ {change.new_value}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'slate' | 'red' | 'green' }) {
  const style =
    tone === 'red' ? 'bg-red-500/15 text-red-300 border-red-500/30'
    : tone === 'green' ? 'bg-green-500/15 text-green-300 border-green-500/30'
    : 'bg-slate-700/40 text-slate-300 border-slate-600/40'
  return (
    <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-md border font-medium', style)}>
      {children}
    </span>
  )
}
