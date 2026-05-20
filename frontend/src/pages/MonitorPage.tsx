import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Network,
  Play,
  Plus,
  Terminal,
  Trash2,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { listRouters } from '@/services/routerService'
import {
  createPreset,
  deletePreset,
  getTaskStatus,
  listPresets,
  runCommands,
  runCommandsBulk,
  snmpPollBulk,
} from '@/services/monitorService'
import type { Router } from '@/types/router'
import type { CommandPreset, RouterRunResult, SNMPBulkResult } from '@/types/monitor'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatUptime(seconds: number | null): string {
  if (seconds === null) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

function exportCSV(results: RouterRunResult[], commands: string[]) {
  const rows: string[] = ['Router,IP,Command,Output']
  for (const r of results) {
    for (const cmd of commands) {
      const output = r.results?.[cmd] ?? r.error ?? ''
      rows.push(`"${r.hostname}","${r.ip_address}","${cmd}","${output.replace(/"/g, '""')}"`)
    }
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `monitor_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

type DiffLine = { text: string; inOther: boolean }

function computeDiff(a: string, b: string): [DiffLine[], DiffLine[]] {
  const linesA = a.split('\n')
  const linesB = b.split('\n')
  const setA = new Set(linesA.map(l => l.trim()).filter(Boolean))
  const setB = new Set(linesB.map(l => l.trim()).filter(Boolean))
  return [
    linesA.map(l => ({ text: l, inOther: !l.trim() || setB.has(l.trim()) })),
    linesB.map(l => ({ text: l, inOther: !l.trim() || setA.has(l.trim()) })),
  ]
}

// ── RouterSelector ────────────────────────────────────────────────────────────

function RouterSelector({
  routers,
  selected,
  onToggle,
  onSelectFiltered,
  onClear,
  showSnmpBadge = false,
}: {
  routers: Router[]
  selected: Set<string>
  onToggle: (id: string) => void
  onSelectFiltered: (ids: string[]) => void
  onClear: () => void
  showSnmpBadge?: boolean
}) {
  const [locFilter, setLocFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [search, setSearch] = useState('')

  const locations = [...new Set(routers.map(r => r.location).filter(Boolean))] as string[]
  const models = [...new Set(routers.map(r => r.model).filter(Boolean))] as string[]

  const filtered = routers.filter(r => {
    if (locFilter && r.location !== locFilter) return false
    if (modelFilter && r.model !== modelFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return r.hostname.toLowerCase().includes(q) || r.ip_address.includes(q)
    }
    return true
  })

  const filteredIds = filtered.map(r => r.id)
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id))

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        {locations.length > 0 && (
          <select
            value={locFilter}
            onChange={e => setLocFilter(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">All locations</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        {models.length > 0 && (
          <select
            value={modelFilter}
            onChange={e => setModelFilter(e.target.value)}
            className="px-2 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">All models</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <input
          type="text"
          placeholder="Search hostname or IP…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-28 px-2 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">{filtered.length} shown · {selected.size} selected</span>
        <div className="flex gap-3">
          <button
            onClick={() => allFilteredSelected ? onClear() : onSelectFiltered(filteredIds)}
            className="text-brand-400 hover:text-brand-300 transition"
          >
            {allFilteredSelected ? 'Deselect' : 'Select shown'}
          </button>
          {selected.size > 0 && !allFilteredSelected && (
            <button onClick={onClear} className="text-gray-500 hover:text-gray-400 transition">
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-800 bg-gray-950">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-600 py-6 text-center">No routers match.</p>
        ) : (
          filtered.map(r => (
            <label
              key={r.id}
              className="flex items-center gap-2.5 cursor-pointer px-3 py-2 hover:bg-gray-800/60 border-b border-gray-800/50 last:border-0 transition"
            >
              <input
                type="checkbox"
                checked={selected.has(r.id)}
                onChange={() => onToggle(r.id)}
                className="w-3.5 h-3.5 accent-brand-600 shrink-0"
              />
              <span className="text-sm text-white font-medium truncate">{r.hostname}</span>
              {showSnmpBadge && (
                <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${(r.snmp_community || r.snmp_v3_username) ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-600'}`}>
                  {(r.snmp_community || r.snmp_v3_username) ? 'SNMP' : 'no SNMP'}
                </span>
              )}
              <span className="text-xs text-gray-500 ml-auto font-mono shrink-0">{r.ip_address}</span>
            </label>
          ))
        )}
      </div>
    </div>
  )
}

// ── CompareModal ──────────────────────────────────────────────────────────────

function CompareModal({
  open,
  onClose,
  results,
  commands,
}: {
  open: boolean
  onClose: () => void
  results: RouterRunResult[]
  commands: string[]
}) {
  const eligible = results.filter(r => r.results && Object.keys(r.results).length > 0)
  const [selCmd, setSelCmd] = useState('')
  const [aId, setAId] = useState('')
  const [bId, setBId] = useState('')

  useEffect(() => {
    if (!open) return
    setSelCmd(commands[0] ?? '')
    setAId(eligible[0]?.router_id ?? '')
    setBId(eligible[1]?.router_id ?? '')
  }, [open])

  if (!open || eligible.length < 2) return null

  const routerA = results.find(r => r.router_id === aId)
  const routerB = results.find(r => r.router_id === bId)
  const outA = routerA?.results?.[selCmd] ?? ''
  const outB = routerB?.results?.[selCmd] ?? ''
  const [linesA, linesB] = computeDiff(outA, outB)
  const diffA = linesA.filter(l => !l.inOther).length
  const diffB = linesB.filter(l => !l.inOther).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-6xl flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div>
            <h2 className="font-semibold text-white">Compare Output</h2>
            {(diffA > 0 || diffB > 0) && (
              <p className="text-xs text-gray-500 mt-0.5">
                <span className="text-red-400">{diffA} line{diffA !== 1 ? 's' : ''} only in A</span>
                {' · '}
                <span className="text-green-400">{diffB} line{diffB !== 1 ? 's' : ''} only in B</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-800 shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">Command</span>
            <select
              value={selCmd}
              onChange={e => setSelCmd(e.target.value)}
              className="px-2 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700 text-white font-mono focus:outline-none"
            >
              {commands.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400 font-semibold shrink-0">A</span>
            <select
              value={aId}
              onChange={e => setAId(e.target.value)}
              className="px-2 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none"
            >
              {eligible.map(r => <option key={r.router_id} value={r.router_id}>{r.hostname}</option>)}
            </select>
          </div>
          <span className="text-gray-600 text-xs">vs</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-green-400 font-semibold shrink-0">B</span>
            <select
              value={bId}
              onChange={e => setBId(e.target.value)}
              className="px-2 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none"
            >
              {eligible.map(r => <option key={r.router_id} value={r.router_id}>{r.hostname}</option>)}
            </select>
          </div>
        </div>

        {/* Diff panels */}
        <div className="grid grid-cols-2 divide-x divide-gray-800 overflow-hidden" style={{ minHeight: 0, flex: 1 }}>
          <div className="flex flex-col min-h-0">
            <div className="px-4 py-2 border-b border-gray-800 bg-gray-950/50 shrink-0">
              <span className="text-xs font-mono font-semibold text-red-400">{routerA?.hostname}</span>
              <span className="text-xs text-gray-600 ml-2">{routerA?.ip_address}</span>
            </div>
            <div className="overflow-auto flex-1">
              <pre className="px-3 py-2 text-xs font-mono leading-5">
                {linesA.map((line, i) => (
                  <div key={i} className={line.inOther ? 'text-gray-300' : 'bg-red-900/30 text-red-300'}>
                    {line.text || ' '}
                  </div>
                ))}
              </pre>
            </div>
          </div>
          <div className="flex flex-col min-h-0">
            <div className="px-4 py-2 border-b border-gray-800 bg-gray-950/50 shrink-0">
              <span className="text-xs font-mono font-semibold text-green-400">{routerB?.hostname}</span>
              <span className="text-xs text-gray-600 ml-2">{routerB?.ip_address}</span>
            </div>
            <div className="overflow-auto flex-1">
              <pre className="px-3 py-2 text-xs font-mono leading-5">
                {linesB.map((line, i) => (
                  <div key={i} className={line.inOther ? 'text-gray-300' : 'bg-green-900/30 text-green-300'}>
                    {line.text || ' '}
                  </div>
                ))}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CommandLibrary ────────────────────────────────────────────────────────────

function CommandLibrary({
  presets,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
  isAdmin,
  onPresetAdded,
  onPresetDeleted,
}: {
  presets: CommandPreset[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onSelectAll: () => void
  onClear: () => void
  isAdmin: boolean
  onPresetAdded: (p: CommandPreset) => void
  onPresetDeleted: (id: string) => void
}) {
  const [addValue, setAddValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  async function handleAdd() {
    const cmd = addValue.trim()
    if (!cmd) return
    setAdding(true)
    setAddError('')
    try {
      const preset = await createPreset(cmd)
      onPresetAdded(preset)
      setAddValue('')
    } catch (e: any) {
      setAddError(e?.response?.data?.detail ?? 'Failed to add command')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePreset(id)
      onPresetDeleted(id)
    } catch {
      // silently ignore — preset may have been deleted already
    }
  }

  const allSelected = presets.length > 0 && presets.every(p => selectedIds.has(p.id))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{selectedIds.size}/{presets.length} selected</span>
        <button
          onClick={allSelected ? onClear : onSelectAll}
          className="text-xs text-brand-400 hover:text-brand-300 transition"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-800 bg-gray-950">
        {presets.length === 0 ? (
          <p className="text-xs text-gray-600 py-6 text-center">No commands in library.</p>
        ) : (
          presets.map(p => (
            <div
              key={p.id}
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800/60 border-b border-gray-800/50 last:border-0 group transition"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(p.id)}
                onChange={() => onToggle(p.id)}
                className="w-3.5 h-3.5 accent-brand-600 shrink-0 cursor-pointer"
              />
              <code
                className="flex-1 text-xs text-gray-300 font-mono truncate cursor-pointer"
                onClick={() => onToggle(p.id)}
              >
                {p.command}
              </code>
              {isAdmin && (
                <button
                  onClick={() => handleDelete(p.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {isAdmin && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <input
              type="text"
              value={addValue}
              onChange={e => { setAddValue(e.target.value); setAddError('') }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="show ip bgp summary…"
              className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-600 font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              onClick={handleAdd}
              disabled={!addValue.trim() || adding}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-brand-600/20 border border-brand-700 text-brand-300 hover:bg-brand-600/30 disabled:opacity-50 transition"
            >
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Add
            </button>
          </div>
          {addError && <p className="text-xs text-red-400">{addError}</p>}
        </div>
      )}
    </div>
  )
}

// ── SSHSection ────────────────────────────────────────────────────────────────

function SSHSection({
  presets,
  routers,
  isAdmin,
  isOperator,
  onPresetAdded,
  onPresetDeleted,
}: {
  presets: CommandPreset[]
  routers: Router[]
  isAdmin: boolean
  isOperator: boolean
  onPresetAdded: (p: CommandPreset) => void
  onPresetDeleted: (id: string) => void
}) {
  const [selectedPresetIds, setSelectedPresetIds] = useState<Set<string>>(new Set())
  const [selectedRouterIds, setSelectedRouterIds] = useState<Set<string>>(new Set())
  const [runState, setRunState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [runError, setRunError] = useState('')
  const [runResults, setRunResults] = useState<RouterRunResult[]>([])
  const [ranCommands, setRanCommands] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)
  const [expandedRouters, setExpandedRouters] = useState<Set<string>>(new Set())
  const [expandedCmds, setExpandedCmds] = useState<Set<string>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const initRef = useRef(false)

  useEffect(() => {
    if (!initRef.current && presets.length > 0) {
      initRef.current = true
      setSelectedPresetIds(new Set(presets.map(p => p.id)))
    }
  }, [presets])

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  function togglePreset(id: string) {
    setSelectedPresetIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleRouter(id: string) {
    setSelectedRouterIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleRouter2(id: string) {
    setExpandedRouters(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleCmd(key: string) {
    setExpandedCmds(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  async function handleRun() {
    const commands = presets.filter(p => selectedPresetIds.has(p.id)).map(p => p.command)
    const routerIds = Array.from(selectedRouterIds)
    if (!commands.length || !routerIds.length) return

    setRunState('running')
    setRunError('')
    setRunResults([])
    setRanCommands(commands)
    setExpandedRouters(new Set())
    setExpandedCmds(new Set())
    if (intervalRef.current) clearInterval(intervalRef.current)

    if (routerIds.length === 1) {
      try {
        const res = await runCommands(routerIds[0], commands)
        const result: RouterRunResult = {
          router_id: res.router_id,
          hostname: res.hostname,
          ip_address: res.ip_address,
          results: res.results,
        }
        setRunResults([result])
        setRunState('done')
        setExpandedRouters(new Set([res.router_id]))
      } catch (e: any) {
        setRunError(e?.response?.data?.detail ?? 'Connection failed')
        setRunState('error')
      }
    } else {
      try {
        const { job_id } = await runCommandsBulk(routerIds, commands)
        intervalRef.current = setInterval(async () => {
          try {
            const st = await getTaskStatus(job_id)
            if (st.state === 'SUCCESS') {
              clearInterval(intervalRef.current!)
              const data = (st.result as { results: Record<string, any> } | null)?.results ?? {}
              setRunResults(
                Object.entries(data).map(([id, r]: [string, any]) => ({
                  router_id: id,
                  hostname: r.hostname,
                  ip_address: r.ip_address,
                  results: r.results,
                  error: r.error,
                }))
              )
              setRunState('done')
            } else if (st.state === 'FAILURE') {
              clearInterval(intervalRef.current!)
              setRunError('Task failed on the worker')
              setRunState('error')
            }
          } catch {
            clearInterval(intervalRef.current!)
            setRunError('Lost connection while polling task status')
            setRunState('error')
          }
        }, 2000)
      } catch (e: any) {
        setRunError(e?.response?.data?.detail ?? 'Failed to dispatch task')
        setRunState('error')
      }
    }
  }

  const cmdCount = presets.filter(p => selectedPresetIds.has(p.id)).length
  const routerCount = selectedRouterIds.size
  const canRun = cmdCount > 0 && routerCount > 0
  const needsOperator = routerCount > 1 && !isOperator
  const successCount = runResults.filter(r => !r.error).length
  const errorCount = runResults.filter(r => !!r.error).length
  const eligibleForCompare = runResults.filter(r => r.results && Object.keys(r.results).length > 0)

  return (
    <section className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 space-y-5">
      <div className="flex items-center gap-2.5">
        <Terminal className="w-5 h-5 text-brand-400 shrink-0" />
        <div>
          <h2 className="font-semibold text-white">SSH Show Commands</h2>
          <p className="text-xs text-gray-500">Run commands on multiple routers simultaneously and compare results.</p>
        </div>
      </div>

      {/* Controls grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Command Library</p>
          <CommandLibrary
            presets={presets}
            selectedIds={selectedPresetIds}
            onToggle={togglePreset}
            onSelectAll={() => setSelectedPresetIds(new Set(presets.map(p => p.id)))}
            onClear={() => setSelectedPresetIds(new Set())}
            isAdmin={isAdmin}
            onPresetAdded={p => {
              onPresetAdded(p)
              setSelectedPresetIds(prev => new Set([...prev, p.id]))
            }}
            onPresetDeleted={id => {
              onPresetDeleted(id)
              setSelectedPresetIds(prev => { const n = new Set(prev); n.delete(id); return n })
            }}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Target Routers</p>
          <RouterSelector
            routers={routers}
            selected={selectedRouterIds}
            onToggle={toggleRouter}
            onSelectFiltered={ids => setSelectedRouterIds(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n })}
            onClear={() => setSelectedRouterIds(new Set())}
          />
        </div>
      </div>

      {/* Run button */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleRun}
          disabled={!canRun || needsOperator || runState === 'running'}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition"
        >
          {runState === 'running' ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Running…</>
          ) : (
            <><Play className="w-4 h-4" />
              Run {cmdCount} command{cmdCount !== 1 ? 's' : ''} on {routerCount} router{routerCount !== 1 ? 's' : ''}
            </>
          )}
        </button>
        {needsOperator && (
          <p className="text-xs text-yellow-500 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Multi-router run requires operator role
          </p>
        )}
      </div>

      {/* Results */}
      {runState !== 'idle' && (
        <div className="border-t border-gray-800 pt-5 space-y-4">
          {runState === 'running' && (
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
              {routerCount > 1 ? 'Job dispatched, polling for results…' : 'Connecting to router…'}
            </div>
          )}

          {runState === 'error' && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-xl px-4 py-3">
              <XCircle className="w-4 h-4 shrink-0" />
              {runError || 'An error occurred'}
            </div>
          )}

          {runState === 'done' && (
            <>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  {errorCount === 0
                    ? <CheckCircle className="w-4 h-4 text-green-400" />
                    : <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                  <span className="text-white font-medium">{successCount}/{runResults.length} routers</span>
                  {errorCount > 0 && <span className="text-red-400">· {errorCount} failed</span>}
                  <span className="text-gray-500">· {ranCommands.length} command{ranCommands.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex gap-2 ml-auto">
                  {eligibleForCompare.length >= 2 && (
                    <button
                      onClick={() => setCompareOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white transition"
                    >
                      <Activity className="w-3.5 h-3.5" />Compare
                    </button>
                  )}
                  <button
                    onClick={() => exportCSV(runResults, ranCommands)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white transition"
                  >
                    <Download className="w-3.5 h-3.5" />Export CSV
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {runResults.map(r => {
                  const isExp = expandedRouters.has(r.router_id)
                  const hasErr = !!r.error && !r.results
                  return (
                    <div key={r.router_id} className="border border-gray-800 rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleRouter2(r.router_id)}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-900 hover:bg-gray-800 transition text-left"
                      >
                        {isExp
                          ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />}
                        {hasErr
                          ? <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                          : <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />}
                        <span className="font-medium text-white text-sm">{r.hostname}</span>
                        <span className="text-xs text-gray-500 font-mono">{r.ip_address}</span>
                        {hasErr && (
                          <span className="ml-auto text-xs text-red-400 truncate max-w-xs">{r.error}</span>
                        )}
                      </button>
                      {isExp && (
                        <div className="divide-y divide-gray-800/40">
                          {ranCommands.map(cmd => {
                            const key = `${r.router_id}:${cmd}`
                            const isCmdExp = expandedCmds.has(key)
                            const output = r.results?.[cmd] ?? (r.error ? `ERROR: ${r.error}` : '(no output)')
                            const isErr = output.startsWith('ERROR:')
                            return (
                              <div key={cmd}>
                                <button
                                  onClick={() => toggleCmd(key)}
                                  className="w-full flex items-center gap-2 px-5 py-2.5 hover:bg-gray-800/50 transition text-left"
                                >
                                  {isCmdExp
                                    ? <ChevronDown className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                                    : <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0" />}
                                  <code className="text-xs font-mono text-brand-400">{cmd}</code>
                                  {isErr && (
                                    <span className="ml-auto text-xs text-red-500 bg-red-900/20 px-1.5 py-0.5 rounded">error</span>
                                  )}
                                </button>
                                {isCmdExp && (
                                  <pre className={`px-5 py-3 text-xs font-mono leading-relaxed whitespace-pre-wrap overflow-x-auto bg-gray-950 border-t border-gray-800/30 ${isErr ? 'text-red-400' : 'text-green-300'}`}>
                                    {output}
                                  </pre>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      <CompareModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        results={runResults}
        commands={ranCommands}
      />
    </section>
  )
}

// ── SNMPSection ───────────────────────────────────────────────────────────────

function SNMPSection({ routers }: { routers: Router[] }) {
  const [selectedRouterIds, setSelectedRouterIds] = useState<Set<string>>(new Set())
  const [snmpState, setSnmpState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [snmpError, setSnmpError] = useState('')
  const [snmpResults, setSnmpResults] = useState<SNMPBulkResult[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  function toggleRouter(id: string) {
    setSelectedRouterIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function handlePoll() {
    const routerIds = Array.from(selectedRouterIds)
    if (!routerIds.length) return
    setSnmpState('running')
    setSnmpError('')
    setSnmpResults([])
    if (intervalRef.current) clearInterval(intervalRef.current)

    try {
      const { job_id } = await snmpPollBulk(routerIds)
      intervalRef.current = setInterval(async () => {
        try {
          const st = await getTaskStatus(job_id)
          if (st.state === 'SUCCESS') {
            clearInterval(intervalRef.current!)
            const data = (st.result as { results: Record<string, any> } | null)?.results ?? {}
            setSnmpResults(
              Object.entries(data).map(([id, r]: [string, any]) => ({
                router_id: id,
                hostname: r.hostname,
                ip_address: r.ip_address,
                reachable: r.reachable,
                sys_name: r.sys_name ?? null,
                uptime_seconds: r.uptime_seconds ?? null,
                cpu_5min_percent: r.cpu_5min_percent ?? null,
                mem_free_bytes: r.mem_free_bytes ?? null,
                if_number: r.if_number ?? null,
                error: r.error ?? null,
                polled_at: r.polled_at,
              }))
            )
            setSnmpState('done')
          } else if (st.state === 'FAILURE') {
            clearInterval(intervalRef.current!)
            setSnmpError('Task failed on the worker')
            setSnmpState('error')
          }
        } catch {
          clearInterval(intervalRef.current!)
          setSnmpError('Lost connection while polling')
          setSnmpState('error')
        }
      }, 2000)
    } catch (e: any) {
      setSnmpError(e?.response?.data?.detail ?? 'Failed to dispatch SNMP task')
      setSnmpState('error')
    }
  }

  const routerCount = selectedRouterIds.size
  const noSnmpCount = [...selectedRouterIds].filter(id => { const r = routers.find(r => r.id === id); return !r?.snmp_community && !r?.snmp_v3_username }).length

  return (
    <section className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 space-y-5">
      <div className="flex items-center gap-2.5">
        <Activity className="w-5 h-5 text-green-400 shrink-0" />
        <div>
          <h2 className="font-semibold text-white">SNMP Metrics</h2>
          <p className="text-xs text-gray-500">Poll CPU, memory, uptime and interface count across multiple routers at once.</p>
        </div>
      </div>

      <RouterSelector
        routers={routers}
        selected={selectedRouterIds}
        onToggle={toggleRouter}
        onSelectFiltered={ids => setSelectedRouterIds(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n })}
        onClear={() => setSelectedRouterIds(new Set())}
        showSnmpBadge
      />

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handlePoll}
          disabled={routerCount === 0 || snmpState === 'running'}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-700/80 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition"
        >
          {snmpState === 'running' ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Polling…</>
          ) : (
            <><Network className="w-4 h-4" />Poll {routerCount} router{routerCount !== 1 ? 's' : ''}</>
          )}
        </button>
        {noSnmpCount > 0 && routerCount > 0 && (
          <p className="text-xs text-yellow-500 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {noSnmpCount} router{noSnmpCount !== 1 ? 's' : ''} without SNMP community configured
          </p>
        )}
      </div>

      {snmpState === 'running' && (
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin text-green-400" />
          Polling {routerCount} router{routerCount !== 1 ? 's' : ''} in parallel (5s timeout each)…
        </div>
      )}

      {snmpState === 'error' && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-xl px-4 py-3">
          <XCircle className="w-4 h-4 shrink-0" />
          {snmpError || 'Poll failed'}
        </div>
      )}

      {snmpState === 'done' && snmpResults.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
                <th className="text-left px-4 py-2.5 font-medium">Router</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">CPU 5m</th>
                <th className="text-right px-4 py-2.5 font-medium">Free Mem</th>
                <th className="text-right px-4 py-2.5 font-medium">Uptime</th>
                <th className="text-right px-4 py-2.5 font-medium">Ifaces</th>
              </tr>
            </thead>
            <tbody>
              {snmpResults
                .sort((a, b) => a.hostname.localeCompare(b.hostname))
                .map(r => (
                  <tr key={r.router_id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-white">{r.hostname}</span>
                      <span className="text-xs text-gray-500 ml-2 font-mono">{r.ip_address}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.reachable ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-400">
                          <CheckCircle className="w-3.5 h-3.5" />reachable
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-red-400 cursor-default"
                          title={r.error ?? ''}
                        >
                          <WifiOff className="w-3.5 h-3.5 shrink-0" />
                          {r.error ? (r.error.length > 28 ? r.error.slice(0, 28) + '…' : r.error) : 'unreachable'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.cpu_5min_percent !== null ? (
                        <span className={
                          r.cpu_5min_percent > 80 ? 'text-red-400 font-medium' :
                          r.cpu_5min_percent > 50 ? 'text-yellow-400' : 'text-gray-300'
                        }>
                          {r.cpu_5min_percent}%
                        </span>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-300">{formatBytes(r.mem_free_bytes)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-300">{formatUptime(r.uptime_seconds)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-300">
                      {r.if_number !== null ? r.if_number : <span className="text-gray-600">—</span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MonitorPage() {
  const { user } = useAuthStore()
  const [presets, setPresets] = useState<CommandPreset[]>([])
  const [routers, setRouters] = useState<Router[]>([])

  useEffect(() => {
    listPresets().then(r => setPresets(r.items)).catch(() => null)
    listRouters({ is_active: true, limit: 200 }).then(r => setRouters(r.items)).catch(() => null)
  }, [])

  const isAdmin = user?.role === 'admin'
  const isOperator = user?.role === 'admin' || user?.role === 'operator'

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Monitor</h1>
        <p className="text-sm text-gray-400 mt-0.5">SSH show commands and SNMP metrics across your network.</p>
      </div>

      <SSHSection
        presets={presets}
        routers={routers}
        isAdmin={isAdmin}
        isOperator={isOperator}
        onPresetAdded={p =>
          setPresets(prev => [...prev, p].sort((a, b) => a.command.localeCompare(b.command)))
        }
        onPresetDeleted={id => setPresets(prev => prev.filter(p => p.id !== id))}
      />

      <SNMPSection routers={routers} />
    </div>
  )
}
