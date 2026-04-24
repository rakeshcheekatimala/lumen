import { useState } from 'react'
import { Zap, Loader2, ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import type { ServiceNode, ChangeRequest, BlastRadiusResult } from '../types'
import { computeBlastRadiusFast, computeBlastRadius } from '../api/client'

const CHANGE_TYPES = [
  { value: 'field_removed', label: 'Remove Field', description: 'Remove a required field' },
  { value: 'field_type_changed', label: 'Change Field Type', description: 'Change field data type' },
  { value: 'endpoint_removed', label: 'Remove Endpoint', description: 'Delete an endpoint entirely' },
  { value: 'field_added', label: 'Add Required Field', description: 'Add a new required field' },
] as const

interface Props {
  services: ServiceNode[]
  onResult: (result: BlastRadiusResult, serviceId: string) => void
  onClear: () => void
}

export default function ChangeSimulator({ services, onResult, onClear }: Props) {
  const [selectedService, setSelectedService] = useState<string>('')
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('')
  const [changeType, setChangeType] = useState<ChangeRequest['change_type']>('field_removed')
  const [fieldName, setFieldName] = useState<string>('')
  const [withAI, setWithAI] = useState(true)
  const [loading, setLoading] = useState(false)

  const service = services.find((s) => s.id === selectedService)
  const endpoints = service?.endpoints || []

  const selectedEndpointObj = endpoints.find((e) => e.id === selectedEndpoint)
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
      const fn = withAI ? computeBlastRadius : computeBlastRadiusFast
      const result = await fn(change)
      onResult(result, selectedService)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-[#0d1526] border border-[#1e2d45] rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Zap size={16} className="text-cyan-400" />
        <span className="text-sm font-semibold text-slate-100">Simulate Change</span>
      </div>

      {/* Service selector */}
      <div className="space-y-1">
        <label className="text-xs text-slate-500">Service</label>
        <div className="relative">
          <select
            className="w-full bg-[#111827] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-slate-200 appearance-none focus:outline-none focus:border-cyan-500/50 transition-colors"
            value={selectedService}
            onChange={(e) => { setSelectedService(e.target.value); setSelectedEndpoint('') }}
          >
            <option value="">Select a service…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
      </div>

      {/* Endpoint selector */}
      <div className="space-y-1">
        <label className="text-xs text-slate-500">Endpoint</label>
        <div className="relative">
          <select
            className="w-full bg-[#111827] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-slate-200 appearance-none focus:outline-none focus:border-cyan-500/50 transition-colors disabled:opacity-40"
            value={selectedEndpoint}
            onChange={(e) => { setSelectedEndpoint(e.target.value); setFieldName('') }}
            disabled={!selectedService}
          >
            <option value="">Select an endpoint…</option>
            {endpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>{ep.method} {ep.path}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
      </div>

      {/* Change type */}
      <div className="space-y-1">
        <label className="text-xs text-slate-500">Change Type</label>
        <div className="grid grid-cols-2 gap-1.5">
          {CHANGE_TYPES.map((ct) => (
            <button
              key={ct.value}
              onClick={() => setChangeType(ct.value)}
              className={clsx(
                'text-xs px-2 py-1.5 rounded-lg border text-left transition-all',
                changeType === ct.value
                  ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300'
                  : 'border-[#1e2d45] bg-[#111827] text-slate-400 hover:border-slate-600',
              )}
            >
              {ct.label}
            </button>
          ))}
        </div>
      </div>

      {/* Field selector */}
      {availableFields.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Field (optional)</label>
          <div className="relative">
            <select
              className="w-full bg-[#111827] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-slate-200 appearance-none focus:outline-none focus:border-cyan-500/50"
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
            >
              <option value="">All fields</option>
              {availableFields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name} ({f.type}){f.required ? ' *' : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>
      )}

      {/* AI toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <div
          onClick={() => setWithAI(!withAI)}
          className={clsx(
            'relative w-8 h-4 rounded-full transition-colors',
            withAI ? 'bg-cyan-500' : 'bg-slate-700',
          )}
        >
          <div className={clsx(
            'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
            withAI ? 'translate-x-4' : 'translate-x-0.5',
          )} />
        </div>
        <span className="text-xs text-slate-400">Include AI analysis</span>
      </label>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSimulate}
          disabled={!selectedService || !selectedEndpoint || loading}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all',
            selectedService && selectedEndpoint && !loading
              ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-900'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed',
          )}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {loading ? 'Analyzing…' : 'Run Blast Radius'}
        </button>
        <button
          onClick={onClear}
          className="px-3 py-2 rounded-lg text-xs text-slate-500 border border-[#1e2d45] hover:border-slate-600 hover:text-slate-400 transition-all"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
