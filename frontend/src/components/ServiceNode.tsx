import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import clsx from 'clsx'
import { Shield, Zap } from 'lucide-react'
import type { RiskLevel } from '../types'

export interface ServiceNodeData {
  label: string
  language: string
  team: string
  riskScore: number
  endpointCount: number
  impactLevel: RiskLevel
  protocol?: string
  isChanged?: boolean
}

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: 'bg-sky-400/12 text-sky-100 border-sky-400/18',
  Go: 'bg-cyan-400/12 text-cyan-100 border-cyan-400/18',
  JavaScript: 'bg-amber-400/12 text-amber-100 border-amber-400/18',
  Python: 'bg-emerald-400/12 text-emerald-100 border-emerald-400/18',
  Java: 'bg-orange-400/12 text-orange-100 border-orange-400/18',
  Ruby: 'bg-rose-500/12 text-rose-100 border-rose-500/18',
  '.NET': 'bg-slate-300/10 text-slate-100 border-white/10',
  Rust: 'bg-orange-400/12 text-orange-100 border-orange-400/18',
  Kotlin: 'bg-blue-400/12 text-blue-100 border-blue-400/18',
  'C++': 'bg-indigo-400/12 text-indigo-100 border-indigo-400/18',
  PHP: 'bg-slate-300/10 text-slate-100 border-white/10',
}

const IMPACT_STYLES: Record<RiskLevel, string> = {
  critical: 'border-rose-500/30 bg-rose-500/[0.06] glow-critical',
  high: 'border-amber-400/28 bg-amber-400/[0.06] glow-high',
  medium: 'border-yellow-400/22 bg-yellow-400/[0.05] glow-medium',
  low: 'border-emerald-400/22 bg-emerald-400/[0.05] glow-low',
  none: 'border-white/10 bg-[rgba(14,27,46,0.94)]',
}

const IMPACT_DOT: Record<RiskLevel, string> = {
  critical: 'bg-rose-400',
  high: 'bg-amber-300',
  medium: 'bg-yellow-300',
  low: 'bg-emerald-400',
  none: 'bg-slate-500',
}

function ServiceNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ServiceNodeData
  const { label, language, team, riskScore, endpointCount, impactLevel, isChanged } = nodeData
  const riskPercent = Math.round(riskScore * 100)
  const languageStyle = LANGUAGE_COLORS[language] || 'bg-white/[0.06] text-slate-100 border-white/10'

  return (
    <div
      className={clsx(
        'min-w-[180px] max-w-[220px] rounded-[20px] border px-4 py-3 shadow-[0_18px_38px_rgba(3,8,17,0.26)] transition-all duration-300',
        IMPACT_STYLES[impactLevel],
        impactLevel !== 'none' && 'impact-pulse',
        selected && 'ring-2 ring-accent-cyan ring-offset-2 ring-offset-[#06101d]',
        isChanged && 'ring-2 ring-cyan-300/80 ring-offset-2 ring-offset-[#06101d]',
      )}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-slate-400 !bg-slate-500" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isChanged && <Zap size={12} className="shrink-0 text-cyan-200" />}
            <span className="truncate text-sm font-semibold text-slate-50">{label}</span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">{team}</p>
        </div>
        <div className={clsx('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', IMPACT_DOT[impactLevel])} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={clsx('rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', languageStyle)}>
          {language}
        </span>
        <span className="text-[11px] text-slate-500">{endpointCount} endpoints</span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Shield size={11} className="text-slate-500" />
          <span className="mono">{riskPercent}% risk</span>
        </div>
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800/90">
          <div
            className={clsx(
              'h-full rounded-full',
              riskPercent >= 70
                ? 'bg-rose-400'
                : riskPercent >= 40
                  ? 'bg-amber-300'
                  : 'bg-emerald-400',
            )}
            style={{ width: `${riskPercent}%` }}
          />
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-slate-400 !bg-slate-500" />
    </div>
  )
}

export default memo(ServiceNodeComponent)
