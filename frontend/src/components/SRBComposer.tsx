import { useState } from 'react'
import { ClipboardCheck, Loader2, Plus, Trash2, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import type {
  ServiceNode, SRBSubmission, SRBValidation, Integration, Protocol,
  Criticality, DataSensitivity, ChangeType,
} from '../types'
import { validateSRB } from '../api/client'

const PROTOCOLS: { value: Protocol; label: string }[] = [
  { value: 'sync-grpc', label: 'Sync • gRPC' },
  { value: 'sync-rest', label: 'Sync • REST' },
  { value: 'async-kafka', label: 'Async • Kafka' },
  { value: 'async-sqs', label: 'Async • SQS' },
]

const CRITICALITIES: Criticality[] = ['critical', 'important', 'nice-to-have']
const SENSITIVITIES: DataSensitivity[] = ['none', 'pii', 'pci', 'phi']

const LOYALTY_PRESET: SRBSubmission = {
  service_name: 'Loyalty Service',
  team: 'CustomerExperience',
  purpose: 'Award loyalty points on successful checkout and let users redeem points at checkout',
  change_type: 'NEW',
  upstream_callers: [
    { service_id: 'frontend', protocol: 'sync-rest', criticality: 'important', data_flow: 'points balance' },
    { service_id: 'checkout', protocol: 'sync-grpc', criticality: 'critical', data_flow: 'award points on success' },
  ],
  downstream_dependencies: [
    { service_id: 'payment', protocol: 'sync-grpc', criticality: 'critical', data_flow: 'verify payment success' },
    { service_id: 'email', protocol: 'sync-rest', criticality: 'important', data_flow: 'notify on points' },
  ],
  data_sensitivity: 'pii',
  expected_rps: 150,
  sla_target_ms: 300,
  deployment: 'k8s',
}

const EMPTY_SUBMISSION: SRBSubmission = {
  service_name: '',
  team: '',
  purpose: '',
  change_type: 'NEW',
  upstream_callers: [],
  downstream_dependencies: [],
  data_sensitivity: 'none',
  expected_rps: 0,
  sla_target_ms: 500,
  deployment: 'k8s',
}

interface Props {
  services: ServiceNode[]
  onValidate: (result: SRBValidation) => void
}

export default function SRBComposer({ services, onValidate }: Props) {
  const [submission, setSubmission] = useState<SRBSubmission>(EMPTY_SUBMISSION)
  const [loading, setLoading] = useState(false)
  const [withAI, setWithAI] = useState(true)

  const update = <K extends keyof SRBSubmission>(key: K, value: SRBSubmission[K]) =>
    setSubmission((s) => ({ ...s, [key]: value }))

  const updateIntegration = (
    kind: 'upstream_callers' | 'downstream_dependencies',
    idx: number,
    patch: Partial<Integration>,
  ) => {
    setSubmission((s) => ({
      ...s,
      [kind]: s[kind].map((i, n) => (n === idx ? { ...i, ...patch } : i)),
    }))
  }

  const addIntegration = (kind: 'upstream_callers' | 'downstream_dependencies') => {
    const newItem: Integration = {
      service_id: services[0]?.id ?? '',
      protocol: 'sync-grpc',
      criticality: 'important',
      data_flow: '',
    }
    setSubmission((s) => ({ ...s, [kind]: [...s[kind], newItem] }))
  }

  const removeIntegration = (kind: 'upstream_callers' | 'downstream_dependencies', idx: number) => {
    setSubmission((s) => ({ ...s, [kind]: s[kind].filter((_, n) => n !== idx) }))
  }

  const submit = async () => {
    if (!submission.service_name.trim() || !submission.team.trim()) return
    setLoading(true)
    try {
      const result = await validateSRB(submission, withAI)
      onValidate(result)
    } finally {
      setLoading(false)
    }
  }

  const loadPreset = () => setSubmission(LOYALTY_PRESET)
  const reset = () => setSubmission(EMPTY_SUBMISSION)

  return (
    <div className="bg-[#0d1526] border border-[#1e2d45] rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={16} className="text-cyan-400" />
          <span className="text-sm font-semibold text-slate-100">SRB Composer</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadPreset}
            className="text-[11px] px-2 py-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
          >
            Load demo
          </button>
          <button
            onClick={reset}
            className="text-[11px] px-2 py-1 rounded-md border border-[#1e2d45] text-slate-500 hover:text-slate-300"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Core metadata */}
      <div className="grid grid-cols-2 gap-2">
        <Input label="Service name" value={submission.service_name} onChange={(v) => update('service_name', v)} />
        <Input label="Team" value={submission.team} onChange={(v) => update('team', v)} />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-slate-500">Purpose</label>
        <textarea
          className="w-full bg-[#111827] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 min-h-[60px]"
          placeholder="What does this service do?"
          value={submission.purpose}
          onChange={(e) => update('purpose', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Select
          label="Change type"
          value={submission.change_type}
          options={[
            { value: 'NEW', label: 'New service' },
            { value: 'ENHANCEMENT', label: 'Enhancement' },
          ]}
          onChange={(v) => update('change_type', v as ChangeType)}
        />
        <Select
          label="Data sensitivity"
          value={submission.data_sensitivity}
          options={SENSITIVITIES.map((s) => ({ value: s, label: s.toUpperCase() }))}
          onChange={(v) => update('data_sensitivity', v as DataSensitivity)}
        />
        <Input
          label="Deployment"
          value={submission.deployment}
          onChange={(v) => update('deployment', v)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label="Expected RPS"
          value={submission.expected_rps}
          onChange={(v) => update('expected_rps', v)}
        />
        <NumberInput
          label="SLA target (ms)"
          value={submission.sla_target_ms}
          onChange={(v) => update('sla_target_ms', v)}
        />
      </div>

      {/* Upstream callers */}
      <IntegrationSection
        title="Upstream callers (who calls me)"
        services={services}
        integrations={submission.upstream_callers}
        onAdd={() => addIntegration('upstream_callers')}
        onRemove={(idx) => removeIntegration('upstream_callers', idx)}
        onChange={(idx, patch) => updateIntegration('upstream_callers', idx, patch)}
      />

      {/* Downstream dependencies */}
      <IntegrationSection
        title="Downstream dependencies (who I call)"
        services={services}
        integrations={submission.downstream_dependencies}
        onAdd={() => addIntegration('downstream_dependencies')}
        onRemove={(idx) => removeIntegration('downstream_dependencies', idx)}
        onChange={(idx, patch) => updateIntegration('downstream_dependencies', idx, patch)}
      />

      {/* AI toggle + submit */}
      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            onClick={() => setWithAI(!withAI)}
            className={clsx(
              'relative w-8 h-4 rounded-full transition-colors',
              withAI ? 'bg-cyan-500' : 'bg-slate-700',
            )}
          >
            <div
              className={clsx(
                'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                withAI ? 'translate-x-4' : 'translate-x-0.5',
              )}
            />
          </div>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Sparkles size={10} /> AI rationale
          </span>
        </label>

        <button
          onClick={submit}
          disabled={!submission.service_name.trim() || !submission.team.trim() || loading}
          className={clsx(
            'flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all',
            submission.service_name.trim() && submission.team.trim() && !loading
              ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-900'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed',
          )}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />}
          {loading ? 'Validating…' : 'Validate SRB'}
        </button>
      </div>
    </div>
  )
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-500">{label}</label>
      <input
        className="w-full bg-[#111827] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-500">{label}</label>
      <input
        type="number"
        className="w-full bg-[#111827] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  )
}

function Select({
  label, value, options, onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-500">{label}</label>
      <select
        className="w-full bg-[#111827] border border-[#1e2d45] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function IntegrationSection({
  title, services, integrations, onAdd, onRemove, onChange,
}: {
  title: string
  services: ServiceNode[]
  integrations: Integration[]
  onAdd: () => void
  onRemove: (idx: number) => void
  onChange: (idx: number, patch: Partial<Integration>) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400 font-medium">{title}</span>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200"
        >
          <Plus size={11} /> Add
        </button>
      </div>

      {integrations.length === 0 && (
        <div className="text-[11px] text-slate-600 italic px-3 py-2 bg-[#111827] rounded-lg border border-dashed border-[#1e2d45]">
          None declared
        </div>
      )}

      {integrations.map((integ, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_1fr_0.8fr_auto] gap-1.5 items-center">
          <select
            className="bg-[#111827] border border-[#1e2d45] rounded-md px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
            value={integ.service_id}
            onChange={(e) => onChange(idx, { service_id: e.target.value })}
          >
            <option value="">Select service…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            className="bg-[#111827] border border-[#1e2d45] rounded-md px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
            value={integ.protocol}
            onChange={(e) => onChange(idx, { protocol: e.target.value as Protocol })}
          >
            {PROTOCOLS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <select
            className="bg-[#111827] border border-[#1e2d45] rounded-md px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
            value={integ.criticality}
            onChange={(e) => onChange(idx, { criticality: e.target.value as Criticality })}
          >
            {CRITICALITIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            onClick={() => onRemove(idx)}
            className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10"
            aria-label="Remove"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
