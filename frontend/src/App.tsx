import { useEffect, useState, useCallback } from 'react'
import { fetchGraph, checkHealth } from './api/client'
import type { DependencyGraph, ServiceNode, BlastRadiusResult, SRBValidation, ViewMode } from './types'
import Header from './components/Header'
import DependencyGraphView from './components/DependencyGraph'
import ChangeSimulator from './components/ChangeSimulator'
import BlastRadiusPanel from './components/BlastRadiusPanel'
import ServiceDetail from './components/ServiceDetail'
import SRBComposer from './components/SRBComposer'
import SRBScorecard from './components/SRBScorecard'
import SchemaDiffView from './components/SchemaDiffView'
import RepoScanner from './components/RepoScanner'
import { Loader2, AlertCircle } from 'lucide-react'

type RightPanel = 'blast-radius' | 'service-detail' | null

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

  useEffect(() => {
    const load = async () => {
      try {
        const [graphData] = await Promise.all([
          fetchGraph(),
          checkHealth().then(() => setIsHealthy(true)).catch(() => {}),
        ])
        setGraph(graphData)
      } catch {
        setError('Failed to connect to backend. Make sure it is running on :8000')
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

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#080c14]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-cyan-500" />
          <span className="text-sm text-slate-500">Loading service graph…</span>
        </div>
      </div>
    )
  }

  if (error || !graph) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#080c14]">
        <div className="flex flex-col items-center gap-3 max-w-sm text-center">
          <AlertCircle size={32} className="text-red-400" />
          <p className="text-sm text-slate-400">{error || 'Failed to load graph'}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-[#080c14] overflow-hidden">
      <Header
        serviceCount={graph.services.length}
        edgeCount={graph.edges.length}
        isHealthy={isHealthy}
        view={view}
        onViewChange={setView}
      />

      {view === 'graph' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar */}
          <div className="w-72 shrink-0 border-r border-[#1e2d45] overflow-y-auto p-3 space-y-3">
            <ChangeSimulator
              services={graph.services}
              onResult={handleBlastRadiusResult}
              onClear={handleClear}
            />

            {/* Service list */}
            <div className="bg-[#0d1526] border border-[#1e2d45] rounded-xl p-3">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">
                Services
              </div>
              <div className="space-y-1">
                {graph.services
                  .slice()
                  .sort((a, b) => b.risk_score - a.risk_score)
                  .map((svc) => {
                    const riskPct = Math.round(svc.risk_score * 100)
                    const impacted = blastRadius?.impacted_services.find((i) => i.service_id === svc.id)
                    const isChanged = svc.id === changedServiceId

                    return (
                      <button
                        key={svc.id}
                        onClick={() => handleNodeClick(svc)}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#1a2640] transition-colors text-left group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={
                            isChanged ? 'w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0' :
                            impacted ? (
                              impacted.risk_level === 'critical' ? 'w-1.5 h-1.5 rounded-full bg-red-500 shrink-0' :
                              impacted.risk_level === 'high' ? 'w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0' :
                              'w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0'
                            ) : 'w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0'
                          } />
                          <span className="text-xs text-slate-300 truncate group-hover:text-slate-100">
                            {svc.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-slate-600 mono">{svc.language}</span>
                          <div className="w-6 h-1 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${riskPct >= 70 ? 'bg-red-500' : riskPct >= 40 ? 'bg-orange-500' : 'bg-green-500'}`}
                              style={{ width: `${riskPct}%` }}
                            />
                          </div>
                        </div>
                      </button>
                    )
                  })}
              </div>
            </div>
          </div>

          {/* Main graph area */}
          <div className="flex-1 relative">
            <DependencyGraphView
              graph={graph}
              blastRadius={blastRadius}
              changedServiceId={changedServiceId}
              onNodeClick={handleNodeClick}
            />
          </div>

          {/* Right panel */}
          {rightPanel && (
            <div className="w-96 shrink-0 overflow-hidden">
              {rightPanel === 'blast-radius' && blastRadius && (
                <BlastRadiusPanel
                  result={blastRadius}
                  loading={aiLoading}
                  onClose={handleCloseRight}
                />
              )}
              {rightPanel === 'service-detail' && selectedService && (
                <ServiceDetail
                  service={selectedService}
                  onClose={handleCloseRight}
                />
              )}
            </div>
          )}
        </div>
      )}

      {view === 'srb' && (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-3xl mx-auto">
              <SRBComposer services={graph.services} onValidate={setSrbResult} />
            </div>
          </div>
          {srbResult && (
            <div className="w-[440px] shrink-0 overflow-hidden">
              <SRBScorecard result={srbResult} onClose={() => setSrbResult(null)} />
            </div>
          )}
        </div>
      )}

      {view === 'schema-diff' && <SchemaDiffView />}

      {view === 'repo-scan' && (
        <div className="flex-1 overflow-hidden">
          <RepoScanner
            onGraphUpdated={() => {
              fetchGraph().then(setGraph).catch(() => {})
            }}
          />
        </div>
      )}
    </div>
  )
}
