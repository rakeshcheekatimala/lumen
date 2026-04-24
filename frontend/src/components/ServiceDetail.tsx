import { X, Globe, Users, Server, Shield } from 'lucide-react'
import clsx from 'clsx'
import type { ServiceNode } from '../types'

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-500/20 text-green-300 border-green-500/30',
  POST: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  PUT: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  DELETE: 'bg-red-500/20 text-red-300 border-red-500/30',
  PATCH: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
}

interface Props {
  service: ServiceNode
  onClose: () => void
}

export default function ServiceDetail({ service, onClose }: Props) {
  const riskPercent = Math.round(service.risk_score * 100)

  return (
    <div className="h-full flex flex-col bg-[#0d1526] border-l border-[#1e2d45] overflow-hidden">
      <div className="p-4 border-b border-[#1e2d45]">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-100">{service.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{service.description}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 p-1 -mt-1 -mr-1"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Globe size={12} className="text-slate-500" />
            <span className="mono">{service.language}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Users size={12} className="text-slate-500" />
            <span>{service.team}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Server size={12} className="text-slate-500" />
            <span className="mono">:{service.port}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Shield size={12} className="text-slate-500" />
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-16 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all',
                    riskPercent >= 70 ? 'bg-red-500' : riskPercent >= 40 ? 'bg-orange-500' : 'bg-green-500',
                  )}
                  style={{ width: `${riskPercent}%` }}
                />
              </div>
              <span>{riskPercent}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-3">
          Endpoints ({service.endpoints.length})
        </div>

        {service.endpoints.length === 0 ? (
          <p className="text-xs text-slate-600 italic">No endpoints exposed (event-driven)</p>
        ) : (
          <div className="space-y-3">
            {service.endpoints.map((ep) => (
              <div key={ep.id} className="bg-[#111827] rounded-lg border border-[#1e2d45] p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={clsx(
                    'text-[10px] font-mono px-1.5 py-0.5 rounded border font-bold',
                    METHOD_COLORS[ep.method] || 'bg-slate-500/20 text-slate-300',
                  )}>
                    {ep.method}
                  </span>
                  <span className="text-xs mono text-slate-300">{ep.path}</span>
                </div>
                {ep.description && (
                  <p className="text-[11px] text-slate-500 mb-2">{ep.description}</p>
                )}

                {ep.request_fields.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[10px] text-slate-600 mb-1">Request</div>
                    <div className="space-y-1">
                      {ep.request_fields.map((f) => (
                        <div key={f.name} className="flex items-center gap-1.5 text-[11px]">
                          <span className={clsx('mono', f.required ? 'text-slate-300' : 'text-slate-500')}>
                            {f.name}
                          </span>
                          <span className="text-slate-600 mono">{f.type}</span>
                          {f.required && <span className="text-red-400 text-[10px]">*</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {ep.response_fields.length > 0 && (
                  <div>
                    <div className="text-[10px] text-slate-600 mb-1">Response</div>
                    <div className="space-y-1">
                      {ep.response_fields.map((f) => (
                        <div key={f.name} className="flex items-center gap-1.5 text-[11px]">
                          <span className="mono text-slate-400">{f.name}</span>
                          <span className="text-slate-600 mono">{f.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
