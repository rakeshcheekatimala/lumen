import { AlertTriangle, AlertCircle, Info, CheckCircle2, ChevronDown, ChevronUp, Loader2, Share2 } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import ReactMarkdown from 'react-markdown'
import type { BlastRadiusResult, ImpactedService } from '../types'

const RISK_CONFIG = {
  critical: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', badge: 'bg-red-500/20 text-red-300' },
  high: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', badge: 'bg-orange-500/20 text-orange-300' },
  medium: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', badge: 'bg-yellow-500/20 text-yellow-300' },
  low: { icon: Info, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30', badge: 'bg-green-500/20 text-green-300' },
}

function ImpactCard({ svc }: { svc: ImpactedService }) {
  const config = RISK_CONFIG[svc.risk_level] || RISK_CONFIG.low
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={clsx('rounded-lg border p-2.5 transition-all', config.bg)}>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className={clsx('text-[10px] font-mono px-1.5 py-0.5 rounded', 'bg-slate-700/60 text-slate-400')}>
            D{svc.depth}
          </span>
          <span className="text-xs font-medium text-slate-200">{svc.service_name}</span>
          <span className="text-[10px] text-slate-500">{svc.team}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded', config.badge)}>
            {svc.risk_level}
          </span>
          {svc.affected_endpoints.length > 0 && (
            expanded ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />
          )}
        </div>
      </div>
      {expanded && svc.affected_endpoints.length > 0 && (
        <div className="mt-2 space-y-1">
          {svc.affected_endpoints.map((ep) => (
            <div key={ep} className="text-[10px] mono text-slate-400 bg-slate-800/50 px-2 py-1 rounded">
              {ep}
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
  const config = RISK_CONFIG[result.risk_level] || RISK_CONFIG.low
  const Icon = config.icon

  const directImpact = result.impacted_services.filter((s) => s.depth === 1)
  const transitiveImpact = result.impacted_services.filter((s) => s.depth > 1)

  return (
    <div className="h-full flex flex-col bg-[#0d1526] border-l border-[#1e2d45] overflow-hidden">
      {/* Header */}
      <div className={clsx('p-4 border-b', config.bg.split(' ')[0], 'border-[#1e2d45]')}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon size={16} className={config.color} />
            <span className="text-sm font-semibold text-slate-100">Blast Radius</span>
          </div>
          <div className="flex items-center gap-2">
            {onShareToChat && (
              <button
                onClick={() => onShareToChat(result)}
                className="text-slate-400 hover:text-cyan-300 transition-colors p-1"
                title="Share to chat"
              >
                <Share2 size={14} />
              </button>
            )}
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
          </div>
        </div>

        {/* Changed service */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400">Changed:</span>
          <span className="text-xs font-mono bg-slate-800 px-2 py-0.5 rounded text-cyan-300">
            {result.changed_service_name}
          </span>
          <span className="text-[10px] text-slate-500">
            {result.change_type.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Risk summary */}
        <div className="flex items-center gap-3 mt-2">
          <div className={clsx('flex items-center gap-1.5 px-2 py-1 rounded-lg border', config.bg)}>
            <Icon size={12} className={config.color} />
            <span className={clsx('text-xs font-semibold capitalize', config.color)}>
              {result.risk_level} risk
            </span>
          </div>
          <span className="text-xs text-slate-500">
            {result.total_impacted} service{result.total_impacted !== 1 ? 's' : ''} affected
          </span>
        </div>
      </div>

      {/* Impact list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {directImpact.length > 0 && (
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">
              Direct Impact ({directImpact.length})
            </div>
            <div className="space-y-2">
              {directImpact.map((svc) => <ImpactCard key={svc.service_id} svc={svc} />)}
            </div>
          </div>
        )}

        {transitiveImpact.length > 0 && (
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">
              Transitive Impact ({transitiveImpact.length})
            </div>
            <div className="space-y-2">
              {transitiveImpact.map((svc) => <ImpactCard key={svc.service_id} svc={svc} />)}
            </div>
          </div>
        )}

        {result.total_impacted === 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle2 size={14} className="text-green-400" />
            <span className="text-xs text-green-300">No downstream services impacted</span>
          </div>
        )}

        {/* AI Analysis */}
        {(loading || result.ai_analysis) && (
          <div className="mt-2">
            <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">
              AI Analysis
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 size={12} className="animate-spin" />
                Claude is analyzing…
              </div>
            ) : result.ai_analysis ? (
              <div className="prose-dark text-xs leading-relaxed">
                <ReactMarkdown>{result.ai_analysis}</ReactMarkdown>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
