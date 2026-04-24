import { Activity, Cpu, Network, ClipboardCheck, GitCompareArrows, ScanSearch, MessageSquare } from 'lucide-react'
import clsx from 'clsx'
import type { ViewMode } from '../types'

interface Props {
  serviceCount: number
  edgeCount: number
  isHealthy: boolean
  view: ViewMode
  onViewChange: (view: ViewMode) => void
  unreadCount: number
  onChatToggle: () => void
}

const TABS: { id: ViewMode; label: string; icon: typeof Network }[] = [
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'srb', label: 'SRB Autopilot', icon: ClipboardCheck },
  { id: 'schema-diff', label: 'Schema Diff', icon: GitCompareArrows },
  { id: 'repo-scan', label: 'Repo Scanner', icon: ScanSearch },
]

export default function Header({ serviceCount, edgeCount, isHealthy, view, onViewChange, unreadCount, onChatToggle }: Props) {
  return (
    <header className="h-14 bg-[#0d1526] border-b border-[#1e2d45] flex items-center px-4 gap-4 shrink-0 z-10">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
          <Cpu size={14} className="text-white" />
        </div>
        <div>
          <div className="text-sm font-bold text-slate-100 leading-none">LUMEN</div>
          <div className="text-[10px] text-slate-500 leading-none mt-0.5">Live Unified Meta Engine</div>
        </div>
      </div>

      <div className="w-px h-6 bg-[#1e2d45]" />

      {/* Tabs */}
      <nav className="flex items-center gap-1">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = view === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onViewChange(tab.id)}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                active
                  ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#111827] border border-transparent',
              )}
            >
              <Icon size={12} />
              {tab.label}
            </button>
          )
        })}
      </nav>

      <div className="w-px h-6 bg-[#1e2d45]" />

      {/* Stats */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className={clsx('w-1.5 h-1.5 rounded-full', isHealthy ? 'bg-green-400 animate-pulse' : 'bg-red-400')} />
          <span className="text-xs text-slate-500">
            <span className="text-slate-300 font-medium">{serviceCount}</span> services
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity size={12} className="text-slate-500" />
          <span className="text-xs text-slate-500">
            <span className="text-slate-300 font-medium">{edgeCount}</span> dependencies
          </span>
        </div>
      </div>

      <div className="flex-1" />

      {/* Chat button */}
      <button
        onClick={onChatToggle}
        className="relative p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#111827] transition-colors"
        title="Toggle chat"
      >
        <MessageSquare size={16} />
        {unreadCount > 0 && (
          <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[10px] text-white font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </div>
        )}
      </button>

      {/* Badge */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
        <span className="text-[11px] text-cyan-300 font-medium">Map changes, measure impact</span>
        {/* <span className="text-[11px] text-cyan-300 font-medium">See the blast before it happens</span> */}
      </div>
    </header>
  )
}
