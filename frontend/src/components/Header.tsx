import {
  Activity,
  BotMessageSquare,
  ClipboardCheck,
  Cpu,
  GitCompareArrows,
  MessageSquare,
  Network,
  ScanSearch,
  ShieldAlert,
} from 'lucide-react'
import clsx from 'clsx'
import type { ViewMode } from '../types'

interface Props {
  serviceCount: number
  edgeCount: number
  criticalCount: number
  isHealthy: boolean
  view: ViewMode
  onViewChange: (view: ViewMode) => void
  unreadCount: number
  onChatToggle: () => void
}

const TABS: { id: ViewMode; label: string; icon: typeof Network }[] = [
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'repo-scan', label: 'Repo Scanner', icon: ScanSearch },
  { id: 'srb', label: 'SRB Autopilot', icon: ClipboardCheck },
  { id: 'schema-diff', label: 'Schema Diff', icon: GitCompareArrows },
]

export default function Header({
  serviceCount,
  edgeCount,
  criticalCount,
  isHealthy,
  view,
  onViewChange,
  unreadCount,
  onChatToggle,
}: Props) {
  return (
    <header className="shrink-0 border-b soft-divider bg-[rgba(7,16,28,0.82)] px-3 py-3 backdrop-blur-xl md:px-4">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[linear-gradient(135deg,#183352_0%,#0f243d_55%,#0d1b2f_100%)] shadow-[0_18px_34px_rgba(4,10,19,0.28)]">
              <Cpu size={17} className="text-[#8de1dc]" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-semibold tracking-[0.18em] text-slate-50">LUMEN</h1>
                <span className="glass-badge rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.2em]">
                  Enterprise Control Plane
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-xs text-slate-400 md:text-sm">
                Architecture intelligence for dependency visibility, safe change planning, and contract governance.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="glass-badge flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
              <div className={clsx('h-2 w-2 rounded-full', isHealthy ? 'bg-emerald-400' : 'bg-rose-400')} />
              <span className="font-medium text-slate-200">{isHealthy ? 'Backend Healthy' : 'Backend Unreachable'}</span>
            </div>
            <div className="glass-badge flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
              <ShieldAlert size={14} className="text-amber-300" />
              <span>
                <span className="font-semibold text-slate-100">{criticalCount}</span> elevated-risk services
              </span>
            </div>
            <button
              onClick={onChatToggle}
              className="icon-button relative flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"
              title="Toggle chat"
            >
              <BotMessageSquare size={14} />
              Collaboration
              {unreadCount > 0 && (
                <span className="flex min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="panel-surface flex flex-col gap-3 rounded-2xl px-3 py-3 md:px-4 lg:flex-row lg:items-center lg:justify-between">
          <nav className="no-scrollbar flex items-center gap-2 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const active = view === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => onViewChange(tab.id)}
                  className={clsx(
                    'flex items-center gap-2 whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-medium transition-all',
                    active
                      ? 'border-cyan-400/30 bg-cyan-400/12 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                      : 'border-white/5 bg-white/[0.02] text-slate-400 hover:border-white/10 hover:bg-white/[0.05] hover:text-slate-100',
                  )}
                >
                  <Icon size={15} />
                  {tab.label}
                </button>
              )
            })}
          </nav>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <div className="glass-badge flex items-center gap-2 rounded-xl px-3 py-1.5">
              <Activity size={14} className="text-slate-500" />
              <span>
                <span className="font-semibold text-slate-100">{serviceCount}</span> services
              </span>
            </div>
            <div className="glass-badge flex items-center gap-2 rounded-xl px-3 py-1.5">
              <Network size={14} className="text-slate-500" />
              <span>
                <span className="font-semibold text-slate-100">{edgeCount}</span> dependencies
              </span>
            </div>
            <div className="glass-badge flex items-center gap-2 rounded-xl px-3 py-1.5">
              <MessageSquare size={14} className="text-[#8de1dc]" />
              <span>Map changes, quantify downstream impact</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
