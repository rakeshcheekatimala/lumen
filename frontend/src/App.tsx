import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  AlertCircle,
  Binary,
  Braces,
  Code2,
  Coffee,
  Compass,
  FileCode2,
  Gem,
  type LucideIcon,
  Search,
  ShieldAlert,
  Sparkles,
  SquareTerminal,
  Workflow,
} from 'lucide-react'
import { checkHealth, fetchGraph } from './api/client'
import type { BlastRadiusResult, DependencyGraph, SRBValidation, ServiceNode, ViewMode } from './types'
import BlastRadiusPanel from './components/BlastRadiusPanel'
import ChangeSimulator from './components/ChangeSimulator'
import ChatPanel from './components/ChatPanel'
import DependencyGraphView from './components/DependencyGraph'
import Header from './components/Header'
import RepoScanner from './components/RepoScanner'
import SchemaDiffView from './components/SchemaDiffView'
import ServiceDetail from './components/ServiceDetail'
import SRBComposer from './components/SRBComposer'
import SRBScorecard from './components/SRBScorecard'
import { useChat } from './hooks/useChat'

type RightPanel = 'blast-radius' | 'service-detail' | null

const RISK_STYLES = {
  critical: 'bg-rose-500',
  high: 'bg-amber-400',
  medium: 'bg-yellow-300',
  low: 'bg-emerald-400',
  none: 'bg-slate-500',
} as const

const LANGUAGE_ICONS: Record<string, LucideIcon> = {
  TypeScript: FileCode2,
  JavaScript: Braces,
  Python: SquareTerminal,
  Java: Coffee,
  Ruby: Gem,
  Go: Code2,
  Rust: Binary,
  Kotlin: FileCode2,
  'C++': Binary,
  PHP: Braces,
  '.NET': Code2,
}

const LANGUAGE_ICON_STYLES: Record<string, string> = {
  TypeScript: 'text-sky-200 bg-sky-400/12 border-sky-400/18',
  JavaScript: 'text-amber-100 bg-amber-400/12 border-amber-400/18',
  Python: 'text-emerald-100 bg-emerald-400/12 border-emerald-400/18',
  Java: 'text-orange-100 bg-orange-400/12 border-orange-400/18',
  Ruby: 'text-rose-100 bg-rose-500/12 border-rose-500/18',
  Go: 'text-cyan-100 bg-cyan-400/12 border-cyan-400/18',
  Rust: 'text-orange-100 bg-orange-400/12 border-orange-400/18',
  Kotlin: 'text-blue-100 bg-blue-400/12 border-blue-400/18',
  'C++': 'text-indigo-100 bg-indigo-400/12 border-indigo-400/18',
  PHP: 'text-slate-100 bg-slate-300/10 border-white/10',
  '.NET': 'text-slate-100 bg-slate-300/10 border-white/10',
}

export default function App() {
  const [graph, setGraph] = useState<DependencyGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isHealthy, setIsHealthy] = useState(false)
  const [view, setView] = useState<ViewMode>('graph')
  const [blastRadius, setBlastRadius] = useState<BlastRadiusResult | null>(null)
  const [changedServiceId, setChangedServiceId] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [selectedService, setSelectedService] = useState<ServiceNode | null>(null)
  const [rightPanel, setRightPanel] = useState<RightPanel>(null)
  const [srbResult, setSrbResult] = useState<SRBValidation | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [serviceQuery, setServiceQuery] = useState('')

  const { messages, unreadCount, username, sendMessage, clearUnread, isConnected } = useChat()
  const deferredServiceQuery = useDeferredValue(serviceQuery)

  useEffect(() => {
    const load = async () => {
      try {
        const [graphData] = await Promise.all([
          fetchGraph(),
          checkHealth().then(() => setIsHealthy(true)).catch(() => setIsHealthy(false)),
        ])
        setGraph(graphData)
      } catch {
        setError('Failed to connect to backend. Make sure it is running on port 8000.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const handleBlastRadiusResult = useCallback((result: BlastRadiusResult, serviceId: string) => {
    setBlastRadius(result)
    setChangedServiceId(serviceId)
    setRightPanel('blast-radius')
    setSelectedService(null)

    if (!result.ai_analysis) {
      setAiLoading(true)
      setTimeout(() => setAiLoading(false), 100)
    }
  }, [])

  const handleNodeClick = useCallback((service: ServiceNode) => {
    setSelectedService(service)
    setRightPanel('service-detail')
  }, [])

  const handleClear = useCallback(() => {
    setBlastRadius(null)
    setChangedServiceId(null)
    setRightPanel(null)
  }, [])

  const handleCloseRight = useCallback(() => {
    setRightPanel(null)
    setSelectedService(null)
  }, [])

  const handleToggleChat = useCallback(() => {
    const nextOpen = !chatOpen
    setChatOpen(nextOpen)
    if (nextOpen) {
      clearUnread()
    }
  }, [chatOpen, clearUnread])

  const handleShareToChat = useCallback((result: BlastRadiusResult) => {
    const description = `${result.changed_service_name} (${result.change_type.replace(/_/g, ' ')})`
    sendMessage(description, 'blast_radius', result)
    setChatOpen(true)
    clearUnread()
  }, [sendMessage, clearUnread])

  const elevatedRiskCount = useMemo(
    () => graph?.services.filter((service) => service.risk_score >= 0.65).length ?? 0,
    [graph],
  )

  const topRiskService = useMemo(() => {
    if (!graph?.services.length) return null
    return [...graph.services].sort((a, b) => b.risk_score - a.risk_score)[0]
  }, [graph])

  const filteredServices = useMemo(() => {
    if (!graph) return []
    const query = deferredServiceQuery.trim().toLowerCase()

    return [...graph.services]
      .sort((a, b) => b.risk_score - a.risk_score)
      .filter((service) => {
        if (!query) return true
        return [
          service.name,
          service.team,
          service.language,
          service.description,
        ].some((value) => value.toLowerCase().includes(query))
      })
  }, [graph, deferredServiceQuery])

  if (loading) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center px-4">
        <div className="panel-surface flex w-full max-w-md flex-col items-center gap-4 rounded-3xl px-8 py-10 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-300" />
          <div>
            <h2 className="text-lg font-semibold text-slate-50">Loading workspace</h2>
            <p className="mt-1 text-sm text-slate-400">Preparing your architecture map and analysis surfaces.</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !graph) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center px-4">
        <div className="panel-surface flex w-full max-w-lg flex-col items-center gap-4 rounded-3xl px-8 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300">
            <AlertCircle size={26} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-50">Workspace unavailable</h2>
            <p className="mt-2 text-sm text-slate-400">{error || 'Failed to load service graph.'}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="primary-button rounded-xl px-5 py-2.5 text-sm font-semibold"
          >
            Retry connection
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell h-screen min-h-screen overflow-hidden">
      <div className="relative z-10 flex h-screen min-h-screen flex-col overflow-hidden">
        <Header
          serviceCount={graph.services.length}
          edgeCount={graph.edges.length}
          criticalCount={elevatedRiskCount}
          isHealthy={isHealthy}
          view={view}
          onViewChange={setView}
          unreadCount={unreadCount}
          onChatToggle={handleToggleChat}
        />

        <main className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 pt-3 md:px-4 md:pb-4 xl:overflow-hidden">
          <div className="mx-auto flex h-full max-w-[1800px] flex-col gap-3">
            {view === 'graph' && (
              <div className="flex min-h-0 flex-1 flex-col gap-3 xl:overflow-hidden">
                <section className="grid gap-3 lg:grid-cols-3 xl:shrink-0">
                  <div className="metric-card rounded-[24px] px-4 py-4">
                    <div className="section-label">Platform Topology</div>
                    <div className="mt-2.5 flex items-end justify-between gap-3">
                      <div>
                        <div className="text-[1.9rem] font-semibold leading-none text-slate-50">{graph.services.length}</div>
                        <p className="mt-1 text-[13px] text-slate-400">Connected services in the active architecture map.</p>
                      </div>
                      <div className="glass-badge rounded-2xl px-3 py-2 text-[11px]">
                        {graph.edges.length} active dependencies
                      </div>
                    </div>
                  </div>

                  <div className="metric-card rounded-[24px] px-4 py-4">
                    <div className="section-label">Risk Watch</div>
                    <div className="mt-2.5 flex items-end justify-between gap-3">
                      <div>
                        <div className="text-[1.9rem] font-semibold leading-none text-slate-50">{elevatedRiskCount}</div>
                        <p className="mt-1 text-[13px] text-slate-400">Services currently above the elevated exposure threshold.</p>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-300">
                        <ShieldAlert size={18} />
                      </div>
                    </div>
                  </div>

                  <div className="metric-card rounded-[24px] px-4 py-4">
                    <div className="section-label">Operational Focus</div>
                    <div className="mt-2.5 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-lg font-semibold text-slate-50">
                          {topRiskService?.name || 'No services'}
                        </div>
                        <p className="mt-1 text-sm text-slate-400">
                          Highest current risk concentration across the visible topology.
                        </p>
                      </div>
                      <div className="glass-badge rounded-2xl px-3 py-2 text-[11px]">
                        {topRiskService ? `${Math.round(topRiskService.risk_score * 100)}% risk` : 'Stable'}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="flex min-h-0 flex-1 flex-col gap-3 xl:flex-row xl:overflow-hidden">
                  <aside className="w-full shrink-0 xl:h-full xl:w-[336px] xl:overflow-y-auto xl:pr-1">
                    <div className="panel-surface flex flex-col gap-3 rounded-[28px] p-3">
                      <div className="panel-subtle rounded-[24px] px-4 py-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="section-label">Operations Rail</div>
                            <h2 className="mt-1.5 text-sm font-semibold text-slate-50">Impact planning workspace</h2>
                            <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
                              Designed for architecture and platform teams managing change with enterprise-grade discipline.
                            </p>
                          </div>
                          <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-cyan-400/12 bg-cyan-400/10 text-cyan-200">
                            <Compass size={16} />
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                          <div className="glass-badge flex items-center gap-1.5 rounded-full px-2.5 py-1">
                            <Sparkles size={12} className="text-cyan-200" />
                            Enterprise-ready workflows
                          </div>
                        </div>
                      </div>

                      <ChangeSimulator
                        services={graph.services}
                        onResult={handleBlastRadiusResult}
                        onClear={handleClear}
                        className="rounded-[24px] border-white/8 bg-[linear-gradient(180deg,rgba(15,28,47,0.88)_0%,rgba(10,20,35,0.95)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                      />

                      <div className="panel-subtle flex min-h-[280px] flex-col rounded-[24px]">
                        <div className="border-b soft-divider px-4 py-3.5">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="section-label">Service Directory</div>
                              <h2 className="mt-1.5 text-sm font-semibold text-slate-50">Prioritized service inventory</h2>
                            </div>
                            <div className="glass-badge rounded-xl px-3 py-1.5 text-[11px]">
                              {filteredServices.length} visible
                            </div>
                          </div>
                          <div className="relative mt-3">
                            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                              value={serviceQuery}
                              onChange={(event) => setServiceQuery(event.target.value)}
                              placeholder="Search services, teams, or languages"
                              className="input-shell w-full rounded-xl py-2.5 pl-9 pr-3 text-sm"
                            />
                          </div>
                        </div>

                        <div className="space-y-2 px-3 py-3">
                          {filteredServices.map((service) => {
                            const riskPercent = Math.round(service.risk_score * 100)
                            const impacted = blastRadius?.impacted_services.find((item) => item.service_id === service.id)
                            const isChanged = service.id === changedServiceId
                            const riskLevel = impacted?.risk_level ?? 'none'
                            const LanguageIcon = LANGUAGE_ICONS[service.language] || Code2
                            const languageIconStyle = LANGUAGE_ICON_STYLES[service.language] || 'text-slate-100 bg-white/[0.05] border-white/10'

                            return (
                              <button
                                key={service.id}
                                onClick={() => handleNodeClick(service)}
                                className={clsx(
                                  'panel-subtle w-full rounded-2xl px-3 py-2.5 text-left transition-all',
                                  'hover:-translate-y-0.5 hover:border-white/10 hover:bg-white/[0.04]',
                                  isChanged && 'border-cyan-400/35 bg-cyan-400/[0.08]',
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <div className={clsx('h-2.5 w-2.5 rounded-full', RISK_STYLES[riskLevel])} />
                                      <span className="truncate text-sm font-medium text-slate-100">{service.name}</span>
                                    </div>
                                    <div className="mt-1 flex items-center gap-2">
                                      <p className="truncate text-xs text-slate-500">{service.team}</p>
                                      <span
                                        title={service.language}
                                        aria-label={service.language}
                                        className={clsx(
                                          'flex h-6 w-6 items-center justify-center rounded-full border',
                                          languageIconStyle,
                                        )}
                                      >
                                        <LanguageIcon size={12} />
                                      </span>
                                    </div>
                                  </div>
                                  <span className="glass-badge rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em]">
                                    {riskPercent}%
                                  </span>
                                </div>

                                <div className="mt-2.5 flex items-center justify-between gap-3">
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800/90">
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
                                  <span className="text-[11px] text-slate-500">
                                    {service.endpoints.length} endpoints
                                  </span>
                                </div>
                              </button>
                            )
                          })}

                          {filteredServices.length === 0 && (
                            <div className="flex min-h-[160px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 text-center text-sm text-slate-500">
                              No services matched your search.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </aside>

                  <section className="panel-surface flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-[26px] xl:min-h-0">
                    <div className="flex flex-col gap-3 border-b soft-divider px-4 py-3.5 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="section-label">Dependency Workspace</div>
                        <h2 className="mt-1.5 text-base font-semibold text-slate-50">Live architecture map</h2>
                        <p className="mt-1 text-[13px] text-slate-400">
                          Explore service relationships, click nodes for details, and run change impact scenarios.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <div className="glass-badge flex items-center gap-2 rounded-xl px-3 py-1.5">
                          <Workflow size={13} className="text-[#8de1dc]" />
                          React Flow workspace
                        </div>
                        {blastRadius && (
                          <div className="glass-badge rounded-xl px-3 py-1.5">
                            Active scenario: {blastRadius.changed_service_name}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="relative flex-1">
                      <DependencyGraphView
                        graph={graph}
                        blastRadius={blastRadius}
                        changedServiceId={changedServiceId}
                        onNodeClick={handleNodeClick}
                      />
                    </div>
                  </section>

                  {rightPanel && (
                    <aside className="w-full shrink-0 xl:h-full xl:w-[360px] xl:overflow-y-auto xl:pl-1">
                      {rightPanel === 'blast-radius' && blastRadius && (
                        <BlastRadiusPanel
                          result={blastRadius}
                          loading={aiLoading}
                          onClose={handleCloseRight}
                          onShareToChat={handleShareToChat}
                        />
                      )}
                      {rightPanel === 'service-detail' && selectedService && (
                        <ServiceDetail
                          service={selectedService}
                          onClose={handleCloseRight}
                        />
                      )}
                    </aside>
                  )}
                </section>
              </div>
            )}

            {view === 'srb' && (
              <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
                <div className="panel-surface flex-1 overflow-y-auto rounded-[28px] p-4 md:p-6">
                  <div className="mx-auto max-w-4xl">
                    <SRBComposer services={graph.services} onValidate={setSrbResult} />
                  </div>
                </div>
                {srbResult && (
                  <div className="w-full shrink-0 xl:w-[460px]">
                    <SRBScorecard result={srbResult} onClose={() => setSrbResult(null)} />
                  </div>
                )}
              </div>
            )}

            {view === 'schema-diff' && <SchemaDiffView />}

            {view === 'repo-scan' && (
              <div className="panel-surface flex-1 overflow-hidden rounded-[28px] p-4 md:p-6">
                <RepoScanner />
              </div>
            )}
          </div>
        </main>

        {chatOpen && (
          <>
            <button
              aria-label="Close chat"
              onClick={handleToggleChat}
              className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] xl:hidden"
            />
            <ChatPanel
              messages={messages}
              username={username}
              onSendMessage={sendMessage}
              isConnected={isConnected}
              onClose={handleToggleChat}
            />
          </>
        )}
      </div>
    </div>
  )
}
