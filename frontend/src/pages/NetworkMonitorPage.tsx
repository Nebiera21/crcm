import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Network,
  RefreshCw,
  Server,
  Settings,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import apiClient from '@/lib/apiClient'
import { useAuthStore } from '@/store/authStore'
import type {
  AggregatePoint,
  LatestPing,
  MonitoringSettings,
  PingPoint,
  RouterHealth,
  RouterStatus,
  RouterStatusList,
  TrafficPoint,
} from '@/types/networkMonitor'

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatBps(bits: number | null | undefined): string {
  if (bits === null || bits === undefined) return '—'
  if (bits >= 1_000_000) return `${(bits / 1_000_000).toFixed(1)} Mbps`
  if (bits >= 1_000) return `${(bits / 1_000).toFixed(1)} Kbps`
  return `${bits.toFixed(0)} bps`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatTimeFull(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function routerHealth(r: RouterStatus): RouterHealth {
  const lan = r.lan_ping
  if (!lan) return 'no-data'
  if (!lan.is_up) return 'offline'
  if ((lan.latency_ms ?? 0) > 200 || lan.packet_loss > 20) return 'degraded'
  return 'online'
}

const healthDot: Record<RouterHealth, string> = {
  online: 'bg-green-400 shadow-[0_0_6px_#4ade80]',
  degraded: 'bg-yellow-400 shadow-[0_0_6px_#facc15]',
  offline: 'bg-red-500 shadow-[0_0_6px_#f87171]',
  'no-data': 'bg-gray-700',
}

function PingBadge({ ping, label }: { ping: LatestPing | null; label: string }) {
  if (!ping) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-600">
        <WifiOff className="w-3 h-3" />
        <span>{label}: N/A</span>
      </div>
    )
  }
  const color = ping.is_up ? (ping.latency_ms && ping.latency_ms > 200 ? 'text-yellow-400' : 'text-green-400') : 'text-red-400'
  return (
    <div className={`flex items-center gap-1.5 text-xs ${color}`}>
      {ping.is_up ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      <span>{label}: {ping.is_up ? `${ping.latency_ms?.toFixed(1) ?? '?'} ms` : 'Offline'}</span>
      {ping.packet_loss > 0 && ping.is_up && (
        <span className="text-yellow-500">{ping.packet_loss.toFixed(0)}% loss</span>
      )}
    </div>
  )
}

// ── Settings Modal ────────────────────────────────────────────────────────────

function SettingsModal({ settings, onClose, onSaved }: {
  settings: MonitoringSettings
  onClose: () => void
  onSaved: (s: MonitoringSettings) => void
}) {
  const [retention, setRetention] = useState(settings.retention_days)
  const [pingEnabled, setPingEnabled] = useState(settings.ping_enabled)
  const [snmpEnabled, setSnmpEnabled] = useState(settings.snmp_traffic_enabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await apiClient.put<MonitoringSettings>('/network-monitor/settings', {
        retention_days: retention,
        ping_enabled: pingEnabled,
        snmp_traffic_enabled: snmpEnabled,
      })
      onSaved(res.data)
    } catch {
      setError('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white mb-5">Monitoring Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Data Retention (days)</label>
            <input
              type="number"
              min={1}
              max={90}
              value={retention}
              onChange={e => setRetention(Number(e.target.value))}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={pingEnabled} onChange={e => setPingEnabled(e.target.checked)} className="w-4 h-4 accent-brand-500" />
            <span className="text-sm text-gray-300">Enable Ping Monitoring</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={snmpEnabled} onChange={e => setSnmpEnabled(e.target.checked)} className="w-4 h-4 accent-brand-500" />
            <span className="text-sm text-gray-300">Enable SNMP Traffic Monitoring</span>
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Router Status Card (Overview tab) ─────────────────────────────────────────

function RouterCard({ r }: { r: RouterStatus }) {
  const health = routerHealth(r)
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${healthDot[health]}`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{r.hostname}</p>
            <p className="text-xs text-gray-500">{r.ip_address}</p>
          </div>
        </div>
        {r.location && (
          <span className="text-xs text-gray-600 shrink-0 ml-2">{r.location}</span>
        )}
      </div>

      <div className="space-y-1.5 mb-3">
        <PingBadge ping={r.lan_ping} label="LAN" />
        {r.wan_ip_address && <PingBadge ping={r.wan_ping} label="WAN" />}
      </div>

      {r.has_snmp && r.traffic ? (
        <div className="border-t border-gray-800 pt-2.5 space-y-1">
          <div className="flex items-center gap-1 text-xs text-blue-400">
            <ArrowUpRight className="w-3 h-3" />
            <span>{formatBps(r.traffic.bits_in_per_sec)}</span>
            <span className="text-gray-700 mx-0.5">|</span>
            <ArrowDownRight className="w-3 h-3 text-purple-400" />
            <span className="text-purple-400">{formatBps(r.traffic.bits_out_per_sec)}</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-600">{r.wan_interface}</span>
            <span className={`text-xs ${r.traffic.if_status === 'up' ? 'text-green-500' : 'text-red-400'}`}>
              {r.traffic.if_status ?? '—'}
            </span>
          </div>
        </div>
      ) : r.has_snmp ? (
        <div className="border-t border-gray-800 pt-2.5">
          <p className="text-xs text-gray-600">Waiting for traffic data…</p>
        </div>
      ) : (
        <div className="border-t border-gray-800 pt-2.5">
          <p className="text-xs text-gray-700">No SNMP configured</p>
        </div>
      )}
    </div>
  )
}

// ── Ping table row (Ping tab) ─────────────────────────────────────────────────

function PingTableRow({ r, expanded, onToggle }: { r: RouterStatus; expanded: boolean; onToggle: () => void }) {
  const [history, setHistory] = useState<PingPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [hours, setHours] = useState(1)

  async function loadHistory() {
    setLoading(true)
    try {
      const res = await apiClient.get<PingPoint[]>(`/network-monitor/ping/${r.router_id}?hours=${hours}`)
      setHistory(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (expanded) loadHistory()
  }, [expanded, hours])

  const lanData = history.filter(p => p.target === 'lan')
  const wanData = history.filter(p => p.target === 'wan')

  const health = routerHealth(r)

  return (
    <>
      <tr
        className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${healthDot[health]}`} />
            <div>
              <p className="text-sm font-medium text-white">{r.hostname}</p>
              <p className="text-xs text-gray-500">{r.ip_address}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          {r.lan_ping ? (
            <div className="flex items-center gap-1.5">
              {r.lan_ping.is_up
                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                : <XCircle className="w-3.5 h-3.5 text-red-400" />}
              <span className={`text-xs ${r.lan_ping.is_up ? 'text-green-400' : 'text-red-400'}`}>
                {r.lan_ping.is_up ? 'Online' : 'Offline'}
              </span>
            </div>
          ) : <span className="text-xs text-gray-600">—</span>}
        </td>
        <td className="px-4 py-3 text-xs text-gray-300">
          {r.lan_ping?.latency_ms != null ? `${r.lan_ping.latency_ms.toFixed(1)} ms` : '—'}
        </td>
        <td className="px-4 py-3 text-xs text-gray-400">
          {r.lan_ping ? `${r.lan_ping.packet_loss.toFixed(0)}%` : '—'}
        </td>
        <td className="px-4 py-3">
          {r.wan_ip_address && r.wan_ping ? (
            <div className="flex items-center gap-1.5">
              {r.wan_ping.is_up
                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                : <XCircle className="w-3.5 h-3.5 text-red-400" />}
              <span className={`text-xs ${r.wan_ping.is_up ? 'text-green-400' : 'text-red-400'}`}>
                {r.wan_ping.is_up ? 'Online' : 'Offline'}
              </span>
            </div>
          ) : <span className="text-xs text-gray-600">{r.wan_ip_address ? '—' : 'N/A'}</span>}
        </td>
        <td className="px-4 py-3 text-xs text-gray-300">
          {r.wan_ping?.latency_ms != null ? `${r.wan_ping.latency_ms.toFixed(1)} ms` : '—'}
        </td>
        <td className="px-4 py-3 text-xs text-gray-400">
          {r.wan_ip_address && r.wan_ping ? `${r.wan_ping.packet_loss.toFixed(0)}%` : '—'}
        </td>
        <td className="px-4 py-3 text-right">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 ml-auto" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500 ml-auto" />}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-800/50 bg-gray-900/50">
          <td colSpan={8} className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-400">Latency history — {r.hostname}</p>
              <div className="flex gap-1">
                {[1, 6, 24].map(h => (
                  <button
                    key={h}
                    onClick={e => { e.stopPropagation(); setHours(h) }}
                    className={`px-2 py-0.5 text-xs rounded ${hours === h ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <p className="text-xs text-gray-600 py-4 text-center">Loading…</p>
            ) : lanData.length === 0 ? (
              <p className="text-xs text-gray-600 py-4 text-center">No ping data in this period</p>
            ) : (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lanData.map(p => ({
                    t: formatTime(p.timestamp),
                    lan: p.is_up ? p.latency_ms : null,
                    wan: wanData.find(w => w.timestamp === p.timestamp)?.latency_ms ?? null,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="t" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} unit=" ms" width={55} />
                    <Tooltip
                      contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: '#9ca3af' }}
                    />
                    <Line type="monotone" dataKey="lan" stroke="#4ade80" dot={false} name="LAN" strokeWidth={1.5} connectNulls={false} />
                    {wanData.length > 0 && (
                      <Line type="monotone" dataKey="wan" stroke="#60a5fa" dot={false} name="WAN" strokeWidth={1.5} connectNulls={false} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Traffic table row (Traffic tab) ──────────────────────────────────────────

function TrafficTableRow({ r, expanded, onToggle }: { r: RouterStatus; expanded: boolean; onToggle: () => void }) {
  const [history, setHistory] = useState<TrafficPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [hours, setHours] = useState(1)

  async function loadHistory() {
    setLoading(true)
    try {
      const res = await apiClient.get<TrafficPoint[]>(`/network-monitor/traffic/${r.router_id}?hours=${hours}`)
      setHistory(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (expanded) loadHistory()
  }, [expanded, hours])

  return (
    <>
      <tr
        className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">{r.hostname}</p>
            <p className="text-xs text-gray-500">{r.ip_address}</p>
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">{r.wan_interface ?? '—'}</td>
        <td className="px-4 py-3">
          {r.traffic ? (
            <span className={`text-xs ${r.traffic.if_status === 'up' ? 'text-green-400' : 'text-red-400'}`}>
              {r.traffic.if_status ?? '—'}
            </span>
          ) : <span className="text-xs text-gray-600">—</span>}
        </td>
        <td className="px-4 py-3 text-xs text-blue-400">
          {r.traffic ? formatBps(r.traffic.bits_in_per_sec) : r.has_snmp ? 'Waiting…' : 'No SNMP'}
        </td>
        <td className="px-4 py-3 text-xs text-purple-400">
          {r.traffic ? formatBps(r.traffic.bits_out_per_sec) : '—'}
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">
          {r.traffic ? formatTimeFull(r.traffic.timestamp) : '—'}
        </td>
        <td className="px-4 py-3 text-right">
          {r.has_snmp
            ? (expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 ml-auto" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500 ml-auto" />)
            : null}
        </td>
      </tr>
      {expanded && r.has_snmp && (
        <tr className="border-b border-gray-800/50 bg-gray-900/50">
          <td colSpan={7} className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-400">Traffic — {r.hostname} / {r.wan_interface}</p>
              <div className="flex gap-1">
                {[1, 6, 24].map(h => (
                  <button
                    key={h}
                    onClick={e => { e.stopPropagation(); setHours(h) }}
                    className={`px-2 py-0.5 text-xs rounded ${hours === h ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <p className="text-xs text-gray-600 py-4 text-center">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-gray-600 py-4 text-center">No traffic data in this period</p>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history.map(p => ({
                    t: formatTime(p.timestamp),
                    in: p.bits_in_per_sec != null ? p.bits_in_per_sec / 1_000_000 : null,
                    out: p.bits_out_per_sec != null ? p.bits_out_per_sec / 1_000_000 : null,
                  }))}>
                    <defs>
                      <linearGradient id="colorIn2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorOut2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="t" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} unit=" M" width={52} />
                    <Tooltip
                      contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 11 }}
                      formatter={(v) => [`${Number(v ?? 0).toFixed(2)} Mbps`]}
                    />
                    <Area type="monotone" dataKey="in" stroke="#60a5fa" fill="url(#colorIn2)" name="IN" strokeWidth={1.5} dot={false} connectNulls={false} />
                    <Area type="monotone" dataKey="out" stroke="#a78bfa" fill="url(#colorOut2)" name="OUT" strokeWidth={1.5} dot={false} connectNulls={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Aggregate Traffic Chart ────────────────────────────────────────────────────

function AggregateChart({ hours }: { hours: number }) {
  const [data, setData] = useState<AggregatePoint[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    apiClient.get<AggregatePoint[]>(`/network-monitor/traffic/aggregate?hours=${hours}`)
      .then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [hours])

  if (loading) return <div className="h-56 flex items-center justify-center text-gray-600 text-sm">Loading…</div>
  if (data.length === 0) return (
    <div className="h-56 flex flex-col items-center justify-center text-gray-600 text-sm gap-2">
      <Network className="w-8 h-8 opacity-30" />
      <p>No traffic data yet — waiting for first SNMP poll cycle</p>
    </div>
  )

  const chartData = data.map(p => ({
    t: formatTime(p.timestamp),
    in: p.total_bits_in / 1_000_000,
    out: p.total_bits_out / 1_000_000,
    n: p.router_count,
  }))

  const maxVal = Math.max(...chartData.map(d => Math.max(d.in, d.out))) || 1

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis dataKey="t" tick={{ fill: '#6b7280', fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            domain={[0, maxVal * 1.2]}
            tickFormatter={v => `${v.toFixed(1)}M`}
            width={60}
          />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: 10, fontSize: 12 }}
            labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
            formatter={(v, name) => [`${Number(v ?? 0).toFixed(2)} Mbps`, name === 'in' ? '↑ IN' : '↓ OUT']}
          />
          <Area type="monotone" dataKey="in" stroke="#3b82f6" strokeWidth={2} fill="url(#colorIn)" dot={false} name="in" connectNulls={false} />
          <Area type="monotone" dataKey="out" stroke="#8b5cf6" strokeWidth={2} fill="url(#colorOut)" dot={false} name="out" connectNulls={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'traffic' | 'ping'

export default function NetworkMonitorPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const [status, setStatus] = useState<RouterStatusList | null>(null)
  const [settings, setSettings] = useState<MonitoringSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState(30)
  const [tab, setTab] = useState<Tab>('overview')
  const [hours, setHours] = useState(1)
  const [search, setSearch] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const [statusRes, settingsRes] = await Promise.all([
        apiClient.get<RouterStatusList>('/network-monitor/status'),
        apiClient.get<MonitoringSettings>('/network-monitor/settings'),
      ])
      setStatus(statusRes.data)
      setSettings(settingsRes.data)
      setLastUpdated(new Date())
    } finally {
      setLoading(false)
    }
  }, [])

  const scheduleNext = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (refreshRef.current) clearTimeout(refreshRef.current)

    setCountdown(30)
    countdownRef.current = setInterval(() => {
      setCountdown(c => Math.max(0, c - 1))
    }, 1000)

    refreshRef.current = setTimeout(() => {
      load().then(scheduleNext)
    }, 30000)
  }, [load])

  useEffect(() => {
    load().then(scheduleNext)
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (refreshRef.current) clearTimeout(refreshRef.current)
    }
  }, [])

  function handleRefresh() {
    if (refreshRef.current) clearTimeout(refreshRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    load().then(scheduleNext)
  }

  function toggleRow(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const routers = status?.routers ?? []
  const filtered = routers.filter(r =>
    !search || r.hostname.toLowerCase().includes(search.toLowerCase()) || r.ip_address.includes(search)
  )

  // Summary counts
  const online = routers.filter(r => routerHealth(r) === 'online').length
  const degraded = routers.filter(r => routerHealth(r) === 'degraded').length
  const offline = routers.filter(r => routerHealth(r) === 'offline').length
  const noData = routers.filter(r => routerHealth(r) === 'no-data').length
  const avgLatency = (() => {
    const vals = routers.map(r => r.lan_ping?.latency_ms).filter(v => v != null) as number[]
    if (!vals.length) return null
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
  })()

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64 text-gray-600 text-sm">Loading…</div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Network className="w-6 h-6 text-brand-400" />
            Network Monitor
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {lastUpdated ? `Updated ${formatTimeFull(lastUpdated.toISOString())}` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5">
            <RefreshCw className="w-3 h-3" />
            <span>Auto-refresh in {countdown}s</span>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 text-gray-400 hover:text-white bg-gray-900 border border-gray-800 rounded-lg transition"
            title="Refresh now"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-white bg-gray-900 border border-gray-800 rounded-lg transition"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Online', value: online, color: 'text-green-400', icon: <CheckCircle2 className="w-4 h-4" /> },
          { label: 'Degraded', value: degraded, color: 'text-yellow-400', icon: <AlertCircle className="w-4 h-4" /> },
          { label: 'Offline', value: offline, color: 'text-red-400', icon: <XCircle className="w-4 h-4" /> },
          { label: 'No Data', value: noData, color: 'text-gray-600', icon: <Server className="w-4 h-4" /> },
          { label: 'Avg Latency', value: avgLatency ? `${avgLatency} ms` : '—', color: 'text-blue-400', icon: <Clock className="w-4 h-4" /> },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
            <div className={`flex items-center gap-1.5 text-xs ${s.color} mb-1`}>
              {s.icon}
              <span>{s.label}</span>
            </div>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {(['overview', 'traffic', 'ping'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition ${
              tab === t ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Search (Overview + Ping + Traffic) */}
      {tab !== 'traffic' && (
        <input
          type="text"
          placeholder="Search routers…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      )}

      {/* ── Overview tab ───────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <>
          {filtered.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center text-gray-600 text-sm">
              {search ? 'No routers match your search.' : 'No active routers found.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtered.map(r => <RouterCard key={r.router_id} r={r} />)}
            </div>
          )}
        </>
      )}

      {/* ── Traffic tab ────────────────────────────────────────────────────── */}
      {tab === 'traffic' && (
        <div className="space-y-5">
          {/* Aggregate chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Aggregate WAN Traffic — All Routers</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />IN &nbsp;
                  <span className="inline-block w-2 h-2 rounded-full bg-purple-500 mr-1" />OUT (Mbps)
                </p>
              </div>
              <div className="flex gap-1">
                {[1, 6, 24].map(h => (
                  <button
                    key={h}
                    onClick={() => setHours(h)}
                    className={`px-3 py-1 text-xs rounded-lg ${hours === h ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>
            <AggregateChart hours={hours} />
          </div>

          {/* Per-router traffic table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">Per-Router Traffic</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-gray-600 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left font-medium">Router</th>
                  <th className="px-4 py-3 text-left font-medium">Interface</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">↑ IN</th>
                  <th className="px-4 py-3 text-left font-medium">↓ OUT</th>
                  <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Last Seen</th>
                  <th className="px-4 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {routers.map(r => (
                  <TrafficTableRow
                    key={r.router_id}
                    r={r}
                    expanded={expandedRows.has(`t-${r.router_id}`)}
                    onToggle={() => toggleRow(`t-${r.router_id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Ping tab ───────────────────────────────────────────────────────── */}
      {tab === 'ping' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-600 uppercase tracking-wider">
                <th className="px-4 py-3 text-left font-medium">Router</th>
                <th className="px-4 py-3 text-left font-medium">LAN</th>
                <th className="px-4 py-3 text-left font-medium">Latency</th>
                <th className="px-4 py-3 text-left font-medium">Loss</th>
                <th className="px-4 py-3 text-left font-medium">WAN</th>
                <th className="px-4 py-3 text-left font-medium">Latency</th>
                <th className="px-4 py-3 text-left font-medium">Loss</th>
                <th className="px-4 py-3 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <PingTableRow
                  key={r.router_id}
                  r={r}
                  expanded={expandedRows.has(`p-${r.router_id}`)}
                  onToggle={() => toggleRow(`p-${r.router_id}`)}
                />
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-10 text-center text-gray-600 text-sm">
              {search ? 'No routers match your search.' : 'No active routers found.'}
            </div>
          )}
        </div>
      )}

      {/* Settings modal */}
      {showSettings && settings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={s => { setSettings(s); setShowSettings(false) }}
        />
      )}
    </div>
  )
}
