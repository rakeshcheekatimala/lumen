import { Globe, Shield, Server, Users, X } from 'lucide-react'
import clsx from 'clsx'
import type { ServiceNode } from '../types'

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-400/12 text-emerald-100 border-emerald-400/18',
  POST: 'bg-sky-400/12 text-sky-100 border-sky-400/18',
  PUT: 'bg-amber-400/12 text-amber-100 border-amber-400/18',
  DELETE: 'bg-rose-500/12 text-rose-100 border-rose-500/18',
  PATCH: 'bg-slate-300/10 text-slate-100 border-white/10',
}

interface Props {
  service: ServiceNode
  onClose: () => void
}

export default function ServiceDetail({ service, onClose }: Props) {
  const riskPercent = Math.round(service.risk_score * 100)

  return (
    <section className="panel-surface flex h-full min-h-[420px] flex-col overflow-hidden rounded-[28px]">
      <div className="border-b soft-divider px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="section-label">Service Detail</div>
            <h2 className="mt-2 text-lg font-semibold text-slate-50">{service.name}</h2>
            <p className="mt-1 text-sm text-slate-400">{service.description || 'No additional service description available.'}</p>
          </div>
          <button onClick={onClose} className="icon-button rounded-xl p-2" title="Close panel">
            <X size={15} />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="panel-subtle rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Globe size={15} className="text-slate-500" />
              <span>{service.language}</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">Primary implementation language</div>
          </div>

          <div className="panel-subtle rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Users size={15} className="text-slate-500" />
              <span>{service.team}</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">Owning team</div>
          </div>

          <div className="panel-subtle rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Server size={15} className="text-slate-500" />
              <span className="mono">:{service.port}</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">Primary service port</div>
          </div>

          <div className="panel-subtle rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Shield size={15} className="text-slate-500" />
              <span>{riskPercent}% risk exposure</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800/90">
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
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="section-label">Endpoints</div>
          <div className="glass-badge rounded-xl px-3 py-2 text-xs">
            {service.endpoints.length} exposed interfaces
          </div>
        </div>

        {service.endpoints.length === 0 ? (
          <div className="panel-subtle mt-4 rounded-2xl px-4 py-4 text-sm text-slate-400">
            No endpoints are currently modeled for this service.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {service.endpoints.map((endpoint) => (
              <div key={endpoint.id} className="panel-subtle rounded-2xl px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={clsx('rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', METHOD_COLORS[endpoint.method] || 'bg-white/[0.05] text-slate-100 border-white/10')}>
                    {endpoint.method}
                  </span>
                  <span className="mono text-sm text-slate-200">{endpoint.path}</span>
                </div>

                {endpoint.description && (
                  <p className="mt-2 text-sm text-slate-400">{endpoint.description}</p>
                )}

                {endpoint.request_fields.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Request fields</div>
                    <div className="mt-2 space-y-2">
                      {endpoint.request_fields.map((field) => (
                        <div key={field.name} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-950/24 px-3 py-2 text-xs">
                          <span className={clsx('mono', field.required ? 'text-slate-100' : 'text-slate-400')}>
                            {field.name}
                          </span>
                          <span className="rounded-full bg-white/[0.04] px-2 py-1 text-[10px] text-slate-500">
                            {field.type}
                          </span>
                          {field.required && (
                            <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-200">
                              Required
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {endpoint.response_fields.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Response fields</div>
                    <div className="mt-2 space-y-2">
                      {endpoint.response_fields.map((field) => (
                        <div key={field.name} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-950/24 px-3 py-2 text-xs">
                          <span className="mono text-slate-200">{field.name}</span>
                          <span className="rounded-full bg-white/[0.04] px-2 py-1 text-[10px] text-slate-500">
                            {field.type}
                          </span>
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
    </section>
  )
}
