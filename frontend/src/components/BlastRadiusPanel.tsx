import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import clsx from 'clsx'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  Share2,
  X,
} from 'lucide-react'
import type { BlastRadiusResult, ImpactedService } from '../types'

const RISK_CONFIG = {
  critical: {
    icon: AlertCircle,
    badge: 'bg-rose-500/12 text-rose-200 border-rose-500/20',
    panel: 'border-rose-500/16 bg-rose-500/[0.06]',
    accent: 'text-rose-300',
  },
  high: {
    icon: AlertTriangle,
    badge: 'bg-amber-400/12 text-amber-200 border-amber-400/20',
    panel: 'border-amber-400/16 bg-amber-400/[0.06]',
    accent: 'text-amber-200',
  },
  medium: {
    icon: AlertTriangle,
    badge: 'bg-yellow-400/12 text-yellow-100 border-yellow-400/20',
    panel: 'border-yellow-400/16 bg-yellow-400/[0.05]',
    accent: 'text-yellow-100',
  },
  low: {
    icon: Info,
    badge: 'bg-emerald-400/12 text-emerald-100 border-emerald-400/18',
    panel: 'border-emerald-400/16 bg-emerald-400/[0.05]',
    accent: 'text-emerald-100',
  },
} as const

function ImpactCard({ service }: { service: ImpactedService }) {
  const [expanded, setExpanded] = useState(false)
  const config = RISK_CONFIG[service.risk_level]

  return (
    <div className={clsx('rounded-2xl border px-3 py-3 transition-all', config.panel)}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="glass-badge rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em]">
              D{service.depth}
            </span>
            <span className="truncate text-sm font-medium text-slate-100">{service.service_name}</span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">{service.team}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className={clsx('rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', config.badge)}>
            {service.risk_level}
          </span>
          {service.affected_endpoints.length > 0 && (
            expanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />
          )}
        </div>
      </button>

      {expanded && service.affected_endpoints.length > 0 && (
        <div className="mt-3 space-y-2">
          {service.affected_endpoints.map((endpoint) => (
            <div key={endpoint} className="rounded-xl bg-slate-950/30 px-3 py-2 text-[11px] text-slate-300">
              <span className="mono">{endpoint}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  result: BlastRadiusResult
  loading?: boolean
  onClose: () => void
  onShareToChat?: (result: BlastRadiusResult) => void
}

export default function BlastRadiusPanel({ result, loading, onClose, onShareToChat }: Props) {
  const config = RISK_CONFIG[result.risk_level]
  const Icon = config.icon

  const directImpact = useMemo(
    () => result.impacted_services.filter((service) => service.depth === 1),
    [result.impacted_services],
  )
  const transitiveImpact = useMemo(
    () => result.impacted_services.filter((service) => service.depth > 1),
    [result.impacted_services],
  )

  return (
    <section className="panel-surface flex h-full min-h-[420px] flex-col overflow-hidden rounded-[28px]">
      <div className="border-b soft-divider px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="section-label">Impact Review</div>
            <div className="mt-2 flex items-center gap-2">
              <Icon size={18} className={config.accent} />
              <h2 className="text-lg font-semibold text-slate-50">Blast radius assessment</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Change scenario for <span className="text-slate-200">{result.changed_service_name}</span>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onShareToChat && (
              <button
                onClick={() => onShareToChat(result)}
                className="icon-button rounded-xl p-2"
                title="Share to chat"
              >
                <Share2 size={15} />
              </button>
            )}
            <button onClick={onClose} className="icon-button rounded-xl p-2" title="Close panel">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="panel-subtle rounded-2xl px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Scenario</div>
            <div className="mt-2 text-sm font-medium text-slate-100">{result.change_type.replace(/_/g, ' ')}</div>
            <div className="mt-1 text-xs text-slate-500">{result.changed_endpoint}</div>
          </div>

          <div className={clsx('rounded-2xl border px-4 py-3', config.panel)}>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Risk level</div>
            <div className="mt-2 flex items-center gap-2">
              <span className={clsx('rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', config.badge)}>
                {result.risk_level}
              </span>
              <span className="text-sm text-slate-300">{result.total_impacted} impacted services</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {result.total_impacted === 0 && (
          <div className="rounded-2xl border border-emerald-400/18 bg-emerald-400/[0.06] px-4 py-4">
            <div className="flex items-center gap-2 text-emerald-100">
              <CheckCircle2 size={16} />
              <span className="text-sm font-medium">No downstream services impacted</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              The selected change does not currently propagate to dependent services in the loaded topology.
            </p>
          </div>
        )}

        {directImpact.length > 0 && (
          <div>
            <div className="section-label">Direct Impact</div>
            <div className="mt-3 space-y-2">
              {directImpact.map((service) => (
                <ImpactCard key={service.service_id} service={service} />
              ))}
            </div>
          </div>
        )}

        {transitiveImpact.length > 0 && (
          <div>
            <div className="section-label">Transitive Impact</div>
            <div className="mt-3 space-y-2">
              {transitiveImpact.map((service) => (
                <ImpactCard key={service.service_id} service={service} />
              ))}
            </div>
          </div>
        )}

        {(loading || result.ai_analysis) && (
          <div className="mt-2">
            <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              AI Analysis
              {result.ai_mode && (
                <span className={
                  result.ai_mode === 'real'
                    ? 'text-[9px] font-mono px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-500/25'
                    : 'text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25'
                }>
                  {result.ai_mode === 'real' ? '● LIVE CLAUDE' : '● MOCK'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
