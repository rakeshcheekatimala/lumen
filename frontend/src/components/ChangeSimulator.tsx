import { useState } from 'react'
import { ChevronDown, Loader2, Sparkles, Zap } from 'lucide-react'
import clsx from 'clsx'
import type { BlastRadiusResult, ChangeRequest, ServiceNode } from '../types'
import { computeBlastRadius, computeBlastRadiusFast } from '../api/client'

const CHANGE_TYPES = [
  { value: 'field_removed', label: 'Remove field', description: 'Validate downstream break risk for a removed required field.' },
  { value: 'field_type_changed', label: 'Change field type', description: 'Test schema incompatibility from a datatype change.' },
  { value: 'endpoint_removed', label: 'Remove endpoint', description: 'Estimate fallout when an endpoint is retired.' },
  { value: 'field_added', label: 'Add required field', description: 'Check caller readiness for new required contract data.' },
] as const

interface Props {
  services: ServiceNode[]
  onResult: (result: BlastRadiusResult, serviceId: string) => void
  onClear: () => void
  className?: string
}

export default function ChangeSimulator({ services, onResult, onClear, className }: Props) {
  const [selectedService, setSelectedService] = useState('')
  const [selectedEndpoint, setSelectedEndpoint] = useState('')
  const [changeType, setChangeType] = useState<ChangeRequest['change_type']>('field_removed')
  const [fieldName, setFieldName] = useState('')
  const [withAI, setWithAI] = useState(true)
  const [loading, setLoading] = useState(false)

  const service = services.find((item) => item.id === selectedService)
  const endpoints = service?.endpoints || []
  const selectedEndpointObj = endpoints.find((endpoint) => endpoint.id === selectedEndpoint)
  const availableFields = [
    ...(selectedEndpointObj?.request_fields || []),
    ...(selectedEndpointObj?.response_fields || []),
  ]

  const handleSimulate = async () => {
    if (!selectedService || !selectedEndpoint) return

    setLoading(true)
    try {
      const change: ChangeRequest = {
        service_id: selectedService,
        endpoint_id: selectedEndpoint,
        change_type: changeType,
        field_name: fieldName || undefined,
        description: `${changeType.replace(/_/g, ' ')} on ${selectedEndpoint}${fieldName ? ` (field: ${fieldName})` : ''}`,
      }

      const runner = withAI ? computeBlastRadius : computeBlastRadiusFast
      const result = await runner(change)
      onResult(result, selectedService)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className={clsx('panel-surface rounded-[26px] px-4 py-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="section-label">Change Simulation</div>
          <h2 className="mt-1.5 text-sm font-semibold text-slate-50">Model contract changes before release</h2>
          <p className="mt-1 text-[13px] text-slate-400">
            Select a service, define the contract change, and quantify downstream impact before rollout.
          </p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
          <Zap size={16} />
        </div>
      </div>

      <div className="mt-4 space-y-3.5">
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Service</label>
          <div className="relative">
            <select
              className="input-shell w-full appearance-none rounded-xl px-3 py-2.5 pr-10 text-sm"
              value={selectedService}
              onChange={(event) => {
                setSelectedService(event.target.value)
                setSelectedEndpoint('')
              }}
            >
              <option value="">Choose a service</option>
              {services.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Endpoint</label>
          <div className="relative">
            <select
              className="input-shell w-full appearance-none rounded-xl px-3 py-2.5 pr-10 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              value={selectedEndpoint}
              onChange={(event) => {
                setSelectedEndpoint(event.target.value)
                setFieldName('')
              }}
              disabled={!selectedService}
            >
              <option value="">Choose an endpoint</option>
              {endpoints.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.method} {endpoint.path}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Change type</label>
          <div className="grid gap-2 sm:grid-cols-2">
            {CHANGE_TYPES.map((item) => (
              <button
                key={item.value}
                onClick={() => setChangeType(item.value)}
                className={clsx(
                  'rounded-2xl border px-3 py-2.5 text-left transition-all',
                  changeType === item.value
                    ? 'border-cyan-400/35 bg-cyan-400/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                    : 'border-white/8 bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.04]',
                )}
              >
                <div className="text-[13px] font-medium text-slate-100">{item.label}</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.description}</p>
              </button>
            ))}
          </div>
        </div>

        {availableFields.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Field scope</label>
            <div className="relative">
              <select
                className="input-shell w-full appearance-none rounded-xl px-3 py-2.5 pr-10 text-sm"
                value={fieldName}
                onChange={(event) => setFieldName(event.target.value)}
              >
                <option value="">Apply to all fields</option>
                {availableFields.map((field) => (
                  <option key={field.name} value={field.name}>
                    {field.name} ({field.type}){field.required ? ' *' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>
          </div>
        )}

        <div className="panel-subtle flex items-center justify-between rounded-2xl px-3.5 py-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-200">
              <Sparkles size={15} />
            </div>
            <div>
              <div className="text-[13px] font-medium text-slate-100">Include AI narrative</div>
              <p className="mt-1 text-xs text-slate-400">
                Add explanation and mitigation guidance alongside the blast radius result.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setWithAI(!withAI)}
            className={clsx(
              'relative h-7 w-12 rounded-full transition-colors',
              withAI ? 'bg-cyan-400/90' : 'bg-slate-700',
            )}
            aria-pressed={withAI}
          >
            <span
              className={clsx(
                'absolute top-1 h-5 w-5 rounded-full bg-white transition-transform',
                withAI ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={handleSimulate}
            disabled={!selectedService || !selectedEndpoint || loading}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold',
              selectedService && selectedEndpoint && !loading
                ? 'primary-button'
                : 'cursor-not-allowed bg-slate-800 text-slate-500',
            )}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            {loading ? 'Running analysis' : 'Run blast radius'}
          </button>

          <button
            onClick={onClear}
            className="secondary-button rounded-xl px-4 py-2.5 text-sm font-medium"
          >
            Clear scenario
          </button>
        </div>
      </div>
    </section>
  )
}
