import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Play,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import { listRouters } from '@/services/routerService'
import { listTemplates, previewAdhoc } from '@/services/templateService'
import { deploy } from '@/services/deployService'
import { getTaskStatus } from '@/services/monitorService'
import type { Router } from '@/types/router'
import type { Template } from '@/types/template'
import type { BulkDeployResult, BulkDeployTaskResult } from '@/types/deploy'

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS = ['Configure', 'Select Routers', 'Confirm', 'Progress'] as const
type Step = 0 | 1 | 2 | 3

function Stepper({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2 shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                  ${done ? 'bg-brand-600 text-white' : active ? 'bg-brand-600/20 border-2 border-brand-500 text-brand-400' : 'bg-gray-800 text-gray-600'}`}
              >
                {done ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-sm font-medium ${active ? 'text-white' : done ? 'text-brand-400' : 'text-gray-600'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-3 ${done ? 'bg-brand-600' : 'bg-gray-800'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1: Template & Config
// ---------------------------------------------------------------------------

function StepConfigure({
  templates,
  selectedTemplate,
  onSelectTemplate,
  varValues,
  onVarChange,
  renderedConfig,
  onPreview,
  previewing,
  previewErrors,
  onNext,
}: {
  templates: Template[]
  selectedTemplate: Template | null
  onSelectTemplate: (t: Template | null) => void
  varValues: Record<string, string>
  onVarChange: (name: string, val: string) => void
  renderedConfig: string
  onPreview: () => void
  previewing: boolean
  previewErrors: string[]
  onNext: () => void
}) {
  return (
    <div className="grid grid-cols-2 gap-6 h-full">
      {/* Left: template picker + vars */}
      <div className="space-y-5 overflow-auto pr-2">
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">Template</label>
          <select
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-600 transition-colors"
            value={selectedTemplate?.id ?? ''}
            onChange={(e) => {
              const t = templates.find((t) => t.id === e.target.value) ?? null
              onSelectTemplate(t)
            }}
          >
            <option value="">— select a template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                [{t.category.toUpperCase()}] {t.name}
              </option>
            ))}
          </select>
        </div>

        {selectedTemplate && selectedTemplate.variables.length > 0 && (
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">Variables</label>
            <div className="space-y-3">
              {selectedTemplate.variables.map((v) => (
                <div key={v.name}>
                  <label className="text-xs text-gray-400 mb-1 block">
                    {v.name}
                    {v.required && <span className="text-red-400 ml-0.5">*</span>}
                    {v.description && <span className="text-gray-600 ml-1.5">— {v.description}</span>}
                  </label>
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-sm text-white outline-none focus:border-brand-600 transition-colors"
                    value={varValues[v.name] ?? ''}
                    onChange={(e) => onVarChange(v.name, e.target.value)}
                    placeholder={v.default ?? ''}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onPreview}
          disabled={!selectedTemplate || previewing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-500 disabled:opacity-40 text-sm text-gray-300 transition-colors"
        >
          <Eye className="w-4 h-4" />
          {previewing ? 'Rendering…' : 'Preview'}
        </button>
      </div>

      {/* Right: rendered preview */}
      <div className="flex flex-col min-h-0">
        <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5 shrink-0">Rendered config</label>
        {previewErrors.length > 0 ? (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 space-y-1">
            {previewErrors.map((e, i) => (
              <p key={i} className="text-sm text-red-300 font-mono">{e}</p>
            ))}
          </div>
        ) : renderedConfig ? (
          <pre className="flex-1 overflow-auto bg-gray-900 rounded-lg border border-gray-800 p-4 text-xs font-mono text-green-300 whitespace-pre">
            {renderedConfig}
          </pre>
        ) : (
          <div className="flex-1 bg-gray-900 rounded-lg border border-gray-800 flex items-center justify-center text-gray-700 text-sm">
            Preview will appear here
          </div>
        )}
      </div>

      {/* Next button */}
      <div className="col-span-2 flex justify-end pt-2">
        <button
          onClick={onNext}
          disabled={!renderedConfig || previewErrors.length > 0}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
        >
          Select Routers
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Select Routers
// ---------------------------------------------------------------------------

function StepSelectRouters({
  routers,
  selected,
  onToggle,
  onBack,
  onNext,
}: {
  routers: Router[]
  selected: Set<string>
  onToggle: (id: string) => void
  onBack: () => void
  onNext: () => void
}) {
  const [search, setSearch] = useState('')
  const filtered = routers.filter(
    (r) =>
      r.hostname.toLowerCase().includes(search.toLowerCase()) ||
      r.ip_address.includes(search),
  )

  function toggleAll() {
    if (filtered.every((r) => selected.has(r.id))) {
      filtered.forEach((r) => onToggle(r.id))  // deselect
    } else {
      filtered.forEach((r) => { if (!selected.has(r.id)) onToggle(r.id) })
    }
  }

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-600 transition-colors"
            placeholder="Search by hostname or IP…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={toggleAll}
          className="px-3 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:border-gray-500 transition-colors"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
        <span className="text-sm text-gray-500">{selected.size} selected</span>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden max-h-[400px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-600 text-sm">No active routers found.</div>
        ) : (
          filtered.map((r) => (
            <label
              key={r.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(r.id)}
                onChange={() => onToggle(r.id)}
                className="accent-brand-500 w-4 h-4"
              />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-white text-sm">{r.hostname}</span>
                <span className="text-gray-500 text-xs ml-2">{r.ip_address}</span>
              </div>
              {r.location && <span className="text-xs text-gray-600 hidden md:block">{r.location}</span>}
            </label>
          ))
        )}
      </div>

      <div className="flex justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={onNext}
          disabled={selected.size === 0}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
        >
          Review
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3: Confirm
// ---------------------------------------------------------------------------

function StepConfirm({
  routers,
  selectedIds,
  renderedConfig,
  onBack,
  onDeploy,
  deploying,
}: {
  routers: Router[]
  selectedIds: Set<string>
  renderedConfig: string
  onBack: () => void
  onDeploy: () => void
  deploying: boolean
}) {
  const [showFullConfig, setShowFullConfig] = useState(false)
  const targets = routers.filter((r) => selectedIds.has(r.id))
  const configLines = renderedConfig.split('\n')
  const preview = configLines.slice(0, 20).join('\n')
  const hasMore = configLines.length > 20

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-sm text-yellow-200">
          This will push configuration changes to <strong>{targets.length} live router{targets.length !== 1 ? 's' : ''}</strong>.
          This action cannot be automatically undone — a rollback will be possible if snapshots are captured successfully.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Target routers ({targets.length})</p>
          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden max-h-48 overflow-y-auto">
            {targets.map((r) => (
              <div key={r.id} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800/50 last:border-0">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                <span className="text-sm text-white font-medium">{r.hostname}</span>
                <span className="text-xs text-gray-500 ml-auto">{r.ip_address}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Rendered config</p>
          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            <pre className="p-3 text-xs font-mono text-green-300 whitespace-pre overflow-x-auto max-h-36">
              {showFullConfig ? renderedConfig : preview}
            </pre>
            {hasMore && !showFullConfig && (
              <button
                onClick={() => setShowFullConfig(true)}
                className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-300 border-t border-gray-800 transition-colors"
              >
                +{configLines.length - 20} more lines
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={onDeploy}
          disabled={deploying}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
        >
          {deploying ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Dispatching…</>
          ) : (
            <><Play className="w-4 h-4" /> Deploy Now</>
          )}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4: Progress
// ---------------------------------------------------------------------------

const STATUS_ICON: Record<string, React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />,
  failed: <XCircle className="w-4 h-4 text-red-400 shrink-0" />,
  pending: <Loader2 className="w-4 h-4 text-gray-400 shrink-0 animate-spin" />,
}

function StepProgress({
  jobId,
  historyIds,
  routers,
  onReset,
}: {
  jobId: string
  historyIds: string[]
  routers: Router[]
  onReset: () => void
}) {
  const [state, setState] = useState<'running' | 'done' | 'error'>('running')
  const [results, setResults] = useState<BulkDeployResult[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const routerMap = Object.fromEntries(routers.map((r) => [r.id, r]))

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      try {
        const status = await getTaskStatus(jobId)
        if (status.state === 'SUCCESS') {
          clearInterval(intervalRef.current!)
          const taskResult = status.result as BulkDeployTaskResult | null
          setResults(taskResult?.results ?? [])
          setState('done')
        } else if (status.state === 'FAILURE') {
          clearInterval(intervalRef.current!)
          setState('error')
        }
      } catch {}
    }, 2000)

    return () => clearInterval(intervalRef.current!)
  }, [jobId])

  const successCount = results.filter((r) => r.status === 'success').length
  const failCount = results.filter((r) => r.status === 'failed').length

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {state === 'running' ? (
          <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />
        ) : state === 'done' ? (
          failCount === 0 ? (
            <CheckCircle className="w-5 h-5 text-green-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
          )
        ) : (
          <XCircle className="w-5 h-5 text-red-400" />
        )}
        <div>
          <p className="text-sm font-semibold text-white">
            {state === 'running'
              ? 'Deploying…'
              : state === 'error'
              ? 'Task failed'
              : `Done — ${successCount} succeeded, ${failCount} failed`}
          </p>
          <p className="text-xs text-gray-500 font-mono mt-0.5">Job: {jobId}</p>
        </div>
      </div>

      {state !== 'running' && results.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          {results.map((r) => {
            const router = routerMap[r.router_id]
            const hostname = r.hostname ?? router?.hostname ?? r.router_id
            const isExpanded = expandedId === r.history_id
            return (
              <div key={r.history_id} className="border-b border-gray-800/50 last:border-0">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : r.history_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/30 transition-colors text-left"
                >
                  {STATUS_ICON[r.status] ?? STATUS_ICON.pending}
                  <span className="flex-1 text-sm font-medium text-white">{hostname}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${r.status === 'success' ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'}`}>
                    {r.status}
                  </span>
                </button>
                {isExpanded && r.output && (
                  <pre className="px-4 py-3 text-xs font-mono bg-gray-950 text-gray-300 whitespace-pre overflow-x-auto max-h-48 border-t border-gray-800">
                    {r.output}
                  </pre>
                )}
              </div>
            )
          })}
        </div>
      )}

      {state === 'running' && historyIds.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          {historyIds.map((hid) => (
            <div key={hid} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 last:border-0">
              <Loader2 className="w-4 h-4 text-gray-500 animate-spin shrink-0" />
              <span className="text-sm text-gray-400 font-mono truncate">{hid}</span>
            </div>
          ))}
        </div>
      )}

      {state !== 'running' && (
        <div className="flex gap-3">
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:border-gray-500 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            New deploy
          </button>
          <a
            href="/history"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600/20 border border-brand-700 text-sm text-brand-300 hover:bg-brand-600/30 transition-colors"
          >
            View History
          </a>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DeployPage() {
  const [step, setStep] = useState<Step>(0)
  const [templates, setTemplates] = useState<Template[]>([])
  const [routers, setRouters] = useState<Router[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [varValues, setVarValues] = useState<Record<string, string>>({})
  const [renderedConfig, setRenderedConfig] = useState('')
  const [previewErrors, setPreviewErrors] = useState<string[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [selectedRouterIds, setSelectedRouterIds] = useState<Set<string>>(new Set())
  const [deploying, setDeploying] = useState(false)
  const [jobId, setJobId] = useState('')
  const [historyIds, setHistoryIds] = useState<string[]>([])

  useEffect(() => {
    listTemplates({ limit: 200 }).then((r) => setTemplates(r.items)).catch(() => null)
    listRouters({ is_active: true, limit: 200 }).then((r) => setRouters(r.items)).catch(() => null)
  }, [])

  function handleSelectTemplate(t: Template | null) {
    setSelectedTemplate(t)
    setVarValues({})
    setRenderedConfig('')
    setPreviewErrors([])
  }

  function handleVarChange(name: string, val: string) {
    setVarValues((prev) => ({ ...prev, [name]: val }))
  }

  async function handlePreview() {
    if (!selectedTemplate) return
    setPreviewing(true)
    setPreviewErrors([])
    try {
      const res = await previewAdhoc({ content: selectedTemplate.content, variable_values: varValues })
      if (res.errors.length > 0) {
        setPreviewErrors(res.errors)
        setRenderedConfig('')
      } else {
        setRenderedConfig(res.rendered)
      }
    } catch (e: any) {
      setPreviewErrors([e?.response?.data?.detail ?? 'Preview failed'])
    } finally {
      setPreviewing(false)
    }
  }

  function toggleRouter(id: string) {
    setSelectedRouterIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleDeploy() {
    setDeploying(true)
    try {
      const res = await deploy({
        router_ids: Array.from(selectedRouterIds),
        template_id: selectedTemplate?.id ?? null,
        rendered_config: renderedConfig,
      })
      setJobId(res.job_id)
      setHistoryIds(res.history_ids)
      setStep(3)
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? 'Deploy failed')
    } finally {
      setDeploying(false)
    }
  }

  function handleReset() {
    setStep(0)
    setSelectedTemplate(null)
    setVarValues({})
    setRenderedConfig('')
    setPreviewErrors([])
    setSelectedRouterIds(new Set())
    setJobId('')
    setHistoryIds([])
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Deploy</h1>
        <p className="text-sm text-gray-500 mt-0.5">Push Jinja2 template configs to live routers</p>
      </div>

      <Stepper current={step} />

      <div className="min-h-96">
        {step === 0 && (
          <StepConfigure
            templates={templates}
            selectedTemplate={selectedTemplate}
            onSelectTemplate={handleSelectTemplate}
            varValues={varValues}
            onVarChange={handleVarChange}
            renderedConfig={renderedConfig}
            onPreview={handlePreview}
            previewing={previewing}
            previewErrors={previewErrors}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <StepSelectRouters
            routers={routers}
            selected={selectedRouterIds}
            onToggle={toggleRouter}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepConfirm
            routers={routers}
            selectedIds={selectedRouterIds}
            renderedConfig={renderedConfig}
            onBack={() => setStep(1)}
            onDeploy={handleDeploy}
            deploying={deploying}
          />
        )}
        {step === 3 && (
          <StepProgress
            jobId={jobId}
            historyIds={historyIds}
            routers={routers}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  )
}
