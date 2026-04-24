import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Shield, Zap } from 'lucide-react'
import clsx from 'clsx'
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
  'TypeScript': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Go': 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  'JavaScript': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  'Python': 'bg-green-500/20 text-green-300 border-green-500/30',
  'Java': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  'Ruby': 'bg-red-500/20 text-red-300 border-red-500/30',
  '.NET': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'Rust': 'bg-orange-600/20 text-orange-300 border-orange-600/30',
  'Kotlin': 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  'C++': 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  'PHP': 'bg-indigo-400/20 text-indigo-200 border-indigo-400/30',
}

const RISK_BORDER: Record<RiskLevel, string> = {
  critical: 'border-red-500 glow-critical',
  high: 'border-orange-500 glow-high',
  medium: 'border-yellow-500 glow-medium',
  low: 'border-green-500 glow-low',
  none: 'border-slate-700',
}

const RISK_BG: Record<RiskLevel, string> = {
  critical: 'bg-red-500/10',
  high: 'bg-orange-500/10',
  medium: 'bg-yellow-500/10',
  low: 'bg-green-500/10',
  none: 'bg-[#111827]',
}

const RISK_DOT: Record<RiskLevel, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
  none: 'bg-slate-500',
}

function ServiceNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ServiceNodeData
  const { label, language, team, riskScore, endpointCount, impactLevel, isChanged } = nodeData
  const langStyle = LANGUAGE_COLORS[language] || 'bg-slate-500/20 text-slate-300 border-slate-500/30'
  const riskPercent = Math.round(riskScore * 100)

  return (
    <div
      className={clsx(
        'rounded-xl border-2 px-3 py-2.5 min-w-[160px] max-w-[200px] transition-all duration-300',
        RISK_BORDER[impactLevel],
        RISK_BG[impactLevel],
        impactLevel !== 'none' && 'impact-pulse',
        selected && 'ring-2 ring-accent-cyan ring-offset-2 ring-offset-[#080c14]',
        isChanged && 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-[#080c14]',
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !border-slate-400 !w-2 !h-2" />

      {/* Header row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          {isChanged && <Zap size={12} className="text-cyan-400 shrink-0" />}
          <span className="text-xs font-semibold text-slate-100 leading-tight truncate max-w-[120px]">
            {label}
          </span>
        </div>
        <div className={clsx('w-2 h-2 rounded-full shrink-0', RISK_DOT[impactLevel])} />
      </div>

      {/* Language badge */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border font-medium', langStyle)}>
          {language}
        </span>
        <span className="text-[10px] text-slate-500 truncate">{team}</span>
      </div>

      {/* Metrics row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Shield size={10} className="text-slate-500" />
          <span className="text-[10px] text-slate-500 mono">
            {riskPercent}%
          </span>
        </div>
        <span className="text-[10px] text-slate-600">
          {endpointCount} ep
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !border-slate-400 !w-2 !h-2" />
    </div>
  )
}

export default memo(ServiceNodeComponent)
