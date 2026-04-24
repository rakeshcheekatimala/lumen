import { AlertTriangle, AlertCircle, Info, CheckCircle2, XCircle, Sparkles, Users, GitBranch } from 'lucide-react'
import clsx from 'clsx'
import ReactMarkdown from 'react-markdown'
import type { SRBValidation, AntiPattern, Severity } from '../types'

const SEVERITY_CONFIG: Record<Severity, { color: string; bg: string; icon: typeof AlertCircle }> = {
  critical: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: AlertCircle },
  high: { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', icon: AlertTriangle },
  medium: { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', icon: AlertTriangle },
  low: { color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', icon: Info },
  info: { color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/30', icon: Info },
}

const REC_CONFIG = {
  APPROVE: { label: 'APPROVE', color: 'text-green-300', bg: 'bg-green-500/15 border-green-500/30', icon: CheckCircle2 },
  CONDITIONAL: { label: 'CONDITIONAL', color: 'text-yellow-300', bg: 'bg-yellow-500/15 border-yellow-500/30', icon: AlertTriangle },
  REJECT: { label: 'REJECT', color: 'text-red-300', bg: 'bg-red-500/15 border-red-500/30', icon: XCircle },
}

interface Props {
  result: SRBValidation
  onClose: () => void
}

export default function SRBScorecard({ result, onClose }: Props) {
  const rec = REC_CONFIG[result.recommendation]
  const RecIcon = rec.icon
  const riskPct = Math.round((result.risk_score / 10) * 100)
  const forecast = result.blast_radius_forecast

  return (
    <div className="h-full flex flex-col bg-[#0d1526] border-l border-[#1e2d45] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#1e2d45]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ClipboardIcon />
            <span className="text-sm font-semibold text-slate-100">SRB Scorecard</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-slate-400">{result.submission.service_name}</div>
          <div className="text-[11px] text-slate-500">Team: {result.submission.team} · {result.submission.change_type}</div>
        </div>

        {/* Recommendation + risk */}
        <div className="flex items-center gap-2 mt-3">
          <div className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-lg border', rec.bg)}>
            <RecIcon size={13} className={rec.color} />
            <span className={clsx('text-xs font-semibold', rec.color)}>{rec.label}</span>
          </div>
          <div className="flex items-center gap-2 flex-1">
            <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={clsx(
                  'h-full rounded-full transition-all',
                  riskPct >= 80 ? 'bg-red-500' : riskPct >= 50 ? 'bg-orange-500' : 'bg-green-500',
                )}
                style={{ width: `${riskPct}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 font-mono shrink-0">{result.risk_score}/10</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Anti-patterns */}
        <Section title={`Anti-patterns (${result.anti_patterns.length})`}>
          {result.anti_patterns.length === 0 ? (
            <EmptyNote text="No anti-patterns detected." positive />
          ) : (
            result.anti_patterns.map((p, i) => <AntiPatternCard key={i} pattern={p} />)
          )}
        </Section>

        {/* Forecast */}
        <Section title="Blast-radius forecast">
          <div className="grid grid-cols-2 gap-2">
            <Metric icon={<GitBranch size={11} />} label="New edges" value={forecast.new_edges} />
            <Metric icon={<AlertTriangle size={11} />} label="Sync chain" value={forecast.new_sync_chain_length} />
            <Metric icon={<Users size={11} />} label="Teams" value={forecast.teams_involved.length} />
            <Metric
              icon={<Info size={11} />}
              label="Up / Down"
              value={`${forecast.upstream_count} / ${forecast.downstream_count}`}
            />
          </div>
          {forecast.teams_involved.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {forecast.teams_involved.map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{t}</span>
              ))}
            </div>
          )}
        </Section>

        {/* Similar services */}
        {result.similar_services.length > 0 && (
          <Section title={`Similar existing services (${result.similar_services.length})`}>
            {result.similar_services.map((s) => (
              <div key={s.service_id} className="rounded-lg border border-[#1e2d45] bg-[#111827] p-2.5">
                <div className="text-xs font-medium text-slate-200">{s.service_name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{s.similarity_reason}</div>
              </div>
            ))}
          </Section>
        )}

        {/* Missing elements */}
        {result.missing_elements.length > 0 && (
          <Section title="Missing information">
            <ul className="space-y-1.5">
              {result.missing_elements.map((m, i) => (
                <li key={i} className="text-[11px] text-yellow-300 flex gap-2">
                  <span className="text-yellow-500 shrink-0">•</span>
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Conditions */}
        {result.conditions.length > 0 && (
          <Section title="Conditions to satisfy">
            <ul className="space-y-1.5">
              {result.conditions.map((c, i) => (
                <li key={i} className="text-[11px] text-slate-300 flex gap-2">
                  <span className="text-cyan-400 shrink-0">✓</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* AI rationale */}
        {result.ai_rationale && (
          <Section
            title={
              <span className="flex items-center gap-1">
                <Sparkles size={11} className="text-cyan-400" /> AI rationale
              </span>
            }
          >
            <div className="prose-dark text-xs leading-relaxed">
              <ReactMarkdown>{result.ai_rationale}</ReactMarkdown>
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function AntiPatternCard({ pattern }: { pattern: AntiPattern }) {
  const config = SEVERITY_CONFIG[pattern.severity] ?? SEVERITY_CONFIG.info
  const Icon = config.icon
  return (
    <div className={clsx('rounded-lg border p-2.5', config.bg)}>
      <div className="flex items-start gap-2">
        <Icon size={12} className={clsx('mt-0.5 shrink-0', config.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-100">{pattern.name}</span>
            <span className={clsx('text-[10px] px-1.5 py-0.5 rounded uppercase', config.color, 'bg-slate-800/80')}>
              {pattern.severity}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{pattern.description}</div>
          <div className="text-[11px] text-slate-300 mt-1.5 italic">→ {pattern.suggestion}</div>
        </div>
      </div>
    </div>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#1e2d45] bg-[#111827] px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">{icon} {label}</div>
      <div className="text-sm font-semibold text-slate-200 mt-0.5">{value}</div>
    </div>
  )
}

function EmptyNote({ text, positive }: { text: string; positive?: boolean }) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2 rounded-lg border p-2.5 text-[11px]',
        positive ? 'bg-green-500/10 border-green-500/20 text-green-300' : 'bg-slate-800/40 border-[#1e2d45] text-slate-400',
      )}
    >
      {positive && <CheckCircle2 size={12} />} {text}
    </div>
  )
}

function ClipboardIcon() {
  return (
    <div className="w-5 h-5 rounded-md bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
      <CheckCircle2 size={12} className="text-cyan-300" />
    </div>
  )
}
