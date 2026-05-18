import { useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Cpu,
  Database,
  Loader2,
  Network,
  Play,
  RotateCcw,
  Terminal,
  WifiOff,
} from 'lucide-react'
import { listRouters } from '@/services/routerService'
import { runCommands, SHOW_COMMANDS } from '@/services/monitorService'
import { pollSNMP } from '@/services/snmpService'
import type { Router } from '@/types/router'
import type { CommandRunResponse } from '@/types/monitor'
import type { SNMPMetrics } from '@/types/snmp'

// ---------------------------------------------------------------------------
// SSH: Command output section
// ---------------------------------------------------------------------------

function CommandOutput({ command, output }: { command: string; output: string }) {
  const [open, setOpen] = useState(true)
  const isError = output.startsWith('ERROR:')

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-gray-900 hover:bg-gray-800 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
        )}
        <code className="text-sm font-mono font-medium text-brand-400">{command}</code>
        {isError && (
          <span className="ml-auto text-xs font-medium text-red-400 bg-red-900/30 px-2 py-0.5 rounded">
            error
          </span>
        )}
      </button>
      {open && (
        <pre className={`px-4 py-3 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap bg-gray-950 ${isError ? 'text-red-400' : 'text-green-300'}`}>
          {output || '(no output)'}
        </pre>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SNMP: helpers
// ---------------------------------------------------------------------------

function formatUptime(seconds: number | null): string {
  if (seconds === null) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function MetricTile({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: string
  icon: React.ReactNode
  accent: string
}) {
  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl border ${accent}`}>
      <div className="shrink-0">{icon}</div>
      <div>
        <p className="text-lg font-bold text-white leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SNMP panel
// ---------------------------------------------------------------------------

function SNMPPanel({ routers }: { routers: Router[] }) {
  const [selectedRouter, setSelectedRouter] = useState('')
  const [polling, setPolling] = useState(false)
  const [metrics, setMetrics] = useState<SNMPMetrics | null>(null)
  const [error, setError] = useState('')

  async function handlePoll() {
    if (!selectedRouter) return
    setPolling(true)
    setError('')
    setMetrics(null)
    try {
      const m = await pollSNMP(selectedRouter)
      setMetrics(m)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'SNMP poll failed')
    } finally {
      setPolling(false)
    }
  }

  const snmpRouters = routers.filter((r) => r.snmp_community)
  const selectedObj = routers.find((r) => r.id === selectedRouter)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: controls */}
      <div className="space-y-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <label className="block text-sm font-semibold text-gray-300 mb-2">Router</label>
          <select
            value={selectedRouter}
            onChange={(e) => { setSelectedRouter(e.target.value); setMetrics(null); setError('') }}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Select a router…</option>
            {routers.map((r) => (
              <option key={r.id} value={r.id} disabled={!r.snmp_community}>
                {r.hostname} ({r.ip_address}){!r.snmp_community ? ' — no SNMP' : ''}
              </option>
            ))}
          </select>
          {selectedObj && !selectedObj.snmp_community && (
            <p className="text-xs text-yellow-500 mt-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              No SNMP community configured
            </p>
          )}
          {selectedObj?.snmp_community && (
            <p className="text-xs text-gray-500 mt-1.5">
              Community: <code className="text-gray-400">{selectedObj.snmp_community}</code>
            </p>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2 text-xs text-gray-500">
          <p className="font-semibold text-gray-400 text-sm">Polled OIDs</p>
          <p>sysDescr · sysName · sysUpTime</p>
          <p>Cisco avgBusy5 (CPU 5-min %)</p>
          <p>Cisco freeMem</p>
          <p>ifNumber</p>
          <p className="text-gray-700">SNMPv2c · UDP port 161</p>
        </div>

        <button
          onClick={handlePoll}
          disabled={!selectedRouter || !selectedObj?.snmp_community || polling}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition"
        >
          {polling ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Polling…</>
          ) : (
            <><Activity className="w-4 h-4" />Poll SNMP</>
          )}
        </button>

        {snmpRouters.length === 0 && (
          <p className="text-xs text-yellow-600 text-center">
            No routers have SNMP communities configured. Set them in Inventory.
          </p>
        )}
      </div>

      {/* Right: results */}
      <div className="lg:col-span-2">
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-400 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {!metrics && !polling && !error && (
          <div className="h-64 flex items-center justify-center border border-dashed border-gray-800 rounded-xl">
            <p className="text-sm text-gray-600">Select a router and click Poll SNMP.</p>
          </div>
        )}

        {polling && (
          <div className="h-64 flex items-center justify-center border border-gray-800 rounded-xl bg-gray-900">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-brand-400 animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-400">Polling {selectedObj?.hostname}…</p>
              <p className="text-xs text-gray-600 mt-1">Timeout: 5 seconds.</p>
            </div>
          </div>
        )}

        {metrics && (
          <div className="space-y-5">
            {/* Reachability banner */}
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
              metrics.reachable
                ? 'bg-green-900/20 border-green-800 text-green-300'
                : 'bg-red-900/20 border-red-800 text-red-300'
            }`}>
              {metrics.reachable ? (
                <><CheckCircle className="w-5 h-5 shrink-0" />SNMP reachable — {metrics.hostname} ({metrics.ip_address})</>
              ) : (
                <><WifiOff className="w-5 h-5 shrink-0" />SNMP unreachable{metrics.error ? ` — ${metrics.error}` : ''}</>
              )}
            </div>

            {metrics.reachable && (
              <>
                {/* Key metrics grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricTile
                    label="Uptime"
                    value={formatUptime(metrics.uptime_seconds)}
                    icon={<RotateCcw className="w-5 h-5 text-blue-400" />}
                    accent="bg-blue-900/20 border-blue-800/50"
                  />
                  <MetricTile
                    label="CPU (5-min)"
                    value={metrics.cpu_5min_percent !== null ? `${metrics.cpu_5min_percent}%` : '—'}
                    icon={<Cpu className="w-5 h-5 text-yellow-400" />}
                    accent="bg-yellow-900/20 border-yellow-800/50"
                  />
                  <MetricTile
                    label="Free memory"
                    value={formatBytes(metrics.mem_free_bytes)}
                    icon={<Database className="w-5 h-5 text-purple-400" />}
                    accent="bg-purple-900/20 border-purple-800/50"
                  />
                  <MetricTile
                    label="Interfaces"
                    value={metrics.if_number !== null ? String(metrics.if_number) : '—'}
                    icon={<Network className="w-5 h-5 text-green-400" />}
                    accent="bg-green-900/20 border-green-800/50"
                  />
                </div>

                {/* System info */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3 text-sm">
                  {metrics.sys_name && (
                    <div className="flex items-start gap-3">
                      <span className="text-gray-500 w-24 shrink-0">sysName</span>
                      <span className="text-white font-mono">{metrics.sys_name}</span>
                    </div>
                  )}
                  {metrics.sys_descr && (
                    <div className="flex items-start gap-3">
                      <span className="text-gray-500 w-24 shrink-0">sysDescr</span>
                      <span className="text-gray-300 text-xs font-mono break-all">{metrics.sys_descr}</span>
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <span className="text-gray-500 w-24 shrink-0">Polled at</span>
                    <span className="text-gray-400 text-xs">{new Date(metrics.polled_at).toLocaleString()}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type Tab = 'ssh' | 'snmp'

export default function MonitorPage() {
  const [tab, setTab] = useState<Tab>('ssh')
  const [routers, setRouters] = useState<Router[]>([])

  // SSH state
  const [selectedRouter, setSelectedRouter] = useState('')
  const [selectedCommands, setSelectedCommands] = useState<Set<string>>(new Set(SHOW_COMMANDS))
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<CommandRunResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    listRouters({ is_active: true, limit: 200 })
      .then((res) => setRouters(res.items))
      .catch(() => null)
  }, [])

  function toggleCommand(cmd: string) {
    setSelectedCommands((prev) => {
      const next = new Set(prev)
      next.has(cmd) ? next.delete(cmd) : next.add(cmd)
      return next
    })
  }

  function toggleAll() {
    if (selectedCommands.size === SHOW_COMMANDS.length) {
      setSelectedCommands(new Set())
    } else {
      setSelectedCommands(new Set(SHOW_COMMANDS))
    }
  }

  async function handleRun() {
    if (!selectedRouter) return
    const cmds = SHOW_COMMANDS.filter((c) => selectedCommands.has(c))
    if (!cmds.length) return
    setRunning(true)
    setError('')
    setResult(null)
    try {
      const res = await runCommands(selectedRouter, cmds)
      setResult(res)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to run commands.'
      setError(String(msg))
    } finally {
      setRunning(false)
    }
  }

  const selectedRouterObj = routers.find((r) => r.id === selectedRouter)
  const cmdList = SHOW_COMMANDS.filter((c) => selectedCommands.has(c))
  const allSelected = selectedCommands.size === SHOW_COMMANDS.length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Terminal className="w-5 h-5 text-brand-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Monitor</h1>
          <p className="text-sm text-gray-400 mt-0.5">SSH commands and SNMP metrics.</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-0 border-b border-gray-800 mb-6">
        {(['ssh', 'snmp'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors uppercase tracking-wide ${
              tab === t
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'ssh' ? 'SSH Commands' : 'SNMP Metrics'}
          </button>
        ))}
      </div>

      {/* SSH tab */}
      {tab === 'ssh' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel */}
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <label className="block text-sm font-semibold text-gray-300 mb-2">Router</label>
              <select
                value={selectedRouter}
                onChange={(e) => { setSelectedRouter(e.target.value); setResult(null) }}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select a router…</option>
                {routers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.hostname} ({r.ip_address})
                  </option>
                ))}
              </select>
              {selectedRouterObj && (
                <p className="text-xs text-gray-500 mt-1.5">
                  {selectedRouterObj.location ?? 'No location'} · {selectedRouterObj.model ?? 'Unknown model'}
                </p>
              )}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-gray-300">Commands</label>
                <button onClick={toggleAll} className="text-xs text-brand-400 hover:text-brand-300 transition">
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="space-y-2">
                {SHOW_COMMANDS.map((cmd) => (
                  <label key={cmd} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedCommands.has(cmd)}
                      onChange={() => toggleCommand(cmd)}
                      className="w-3.5 h-3.5 accent-brand-600 shrink-0"
                    />
                    <code className="text-xs text-gray-400 group-hover:text-gray-300 transition font-mono">
                      {cmd}
                    </code>
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleRun}
              disabled={!selectedRouter || cmdList.length === 0 || running}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition"
            >
              {running ? (
                <><RotateCcw className="w-4 h-4 animate-spin" />Running {cmdList.length} command{cmdList.length !== 1 ? 's' : ''}…</>
              ) : (
                <><Play className="w-4 h-4" />Run {cmdList.length} command{cmdList.length !== 1 ? 's' : ''}</>
              )}
            </button>
          </div>

          {/* Right panel: output */}
          <div className="lg:col-span-2">
            {error && (
              <div className="bg-red-900/20 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-400 mb-4">
                {error}
              </div>
            )}
            {!result && !running && !error && (
              <div className="h-64 flex items-center justify-center border border-dashed border-gray-800 rounded-xl">
                <p className="text-sm text-gray-600">Select a router and run commands to see output here.</p>
              </div>
            )}
            {running && (
              <div className="h-64 flex items-center justify-center border border-gray-800 rounded-xl bg-gray-900">
                <div className="text-center">
                  <RotateCcw className="w-8 h-8 text-brand-400 animate-spin mx-auto mb-3" />
                  <p className="text-sm text-gray-400">Connecting to {selectedRouterObj?.hostname}…</p>
                  <p className="text-xs text-gray-600 mt-1">This may take up to 30 seconds.</p>
                </div>
              </div>
            )}
            {result && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <p className="text-sm font-medium text-white">
                    {result.hostname}{' '}
                    <span className="font-mono text-gray-400 font-normal">{result.ip_address}</span>
                  </p>
                  <p className="text-xs text-gray-500">{new Date(result.executed_at).toLocaleTimeString()}</p>
                </div>
                {Object.entries(result.results).map(([cmd, output]) => (
                  <CommandOutput key={cmd} command={cmd} output={output} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SNMP tab */}
      {tab === 'snmp' && <SNMPPanel routers={routers} />}
    </div>
  )
}
