import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Download, Loader2, Search } from 'lucide-react'
import { exportAuditLogs, listAuditLogs } from '@/services/auditService'
import type { AuditLogFilters, AuditLogItem } from '@/types/audit'

// ---------------------------------------------------------------------------
// Action badge
// ---------------------------------------------------------------------------

const ACTION_COLORS: Record<string, string> = {
  'user.': 'bg-blue-900/40 text-blue-300',
  'router.': 'bg-green-900/40 text-green-300',
  'template.': 'bg-purple-900/40 text-purple-300',
  'deploy.': 'bg-orange-900/40 text-orange-300',
  'credential': 'bg-yellow-900/40 text-yellow-300',
}

function ActionBadge({ action }: { action: string }) {
  const cls =
    Object.entries(ACTION_COLORS).find(([prefix]) => action.startsWith(prefix))?.[1] ??
    'bg-gray-800 text-gray-400'
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${cls}`}>{action}</span>
  )
}

// ---------------------------------------------------------------------------
// Detail cell — expandable JSON
// ---------------------------------------------------------------------------

function DetailCell({ detail }: { detail: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)
  const keys = Object.keys(detail)
  if (keys.length === 0) return <span className="text-gray-700 text-xs">—</span>

  const preview = keys
    .slice(0, 2)
    .map((k) => `${k}: ${String(detail[k]).slice(0, 20)}`)
    .join(', ')

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="truncate max-w-[160px]">{preview}{keys.length > 2 ? '…' : ''}</span>
      </button>
      {open && (
        <pre className="mt-1 text-xs font-mono text-gray-400 bg-gray-950 rounded p-2 max-w-xs overflow-auto max-h-32">
          {JSON.stringify(detail, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const RESOURCE_TYPES = ['user', 'router', 'template', 'deploy', 'credential']
const LIMIT = 50

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [skip, setSkip] = useState(0)

  const [filters, setFilters] = useState<AuditLogFilters>({})
  const [actionInput, setActionInput] = useState('')
  const [resourceType, setResourceType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  function buildFilters(): AuditLogFilters {
    return {
      action: actionInput || undefined,
      resource_type: resourceType || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    }
  }

  async function load(s = 0) {
    setLoading(true)
    try {
      const f = buildFilters()
      const res = await listAuditLogs(f, s, LIMIT)
      setItems(res.items)
      setTotal(res.total)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => {
    load(0)
    setSkip(0)
  }, [filters])

  function handleSearch() {
    setFilters(buildFilters())
  }

  function handlePage(n: number) {
    setSkip(n)
    load(n)
  }

  async function handleExport() {
    setExporting(true)
    try {
      await exportAuditLogs(filters)
    } catch {}
    finally { setExporting(false) }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} event{total !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:border-gray-500 disabled:opacity-50 transition-colors shrink-0"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-brand-600 transition-colors"
            placeholder="Filter by action…"
            value={actionInput}
            onChange={(e) => setActionInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <select
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 outline-none focus:border-brand-600 transition-colors"
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value)}
        >
          <option value="">All resources</option>
          {RESOURCE_TYPES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <input
          type="date"
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 outline-none focus:border-brand-600 transition-colors"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          title="From date"
        />
        <input
          type="date"
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 outline-none focus:border-brand-600 transition-colors"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          title="To date"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
        >
          Apply
        </button>
        {(actionInput || resourceType || startDate || endDate) && (
          <button
            onClick={() => {
              setActionInput('')
              setResourceType('')
              setStartDate('')
              setEndDate('')
              setFilters({})
            }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3 text-left font-medium">Time</th>
              <th className="px-4 py-3 text-left font-medium">User</th>
              <th className="px-4 py-3 text-left font-medium">Action</th>
              <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Resource</th>
              <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">IP</th>
              <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Detail</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-600">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-600">No audit events found.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono whitespace-nowrap">
                    {new Date(item.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {item.username ?? <span className="text-gray-700">system</span>}
                  </td>
                  <td className="px-4 py-3">
                    <ActionBadge action={item.action} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">
                    <span className="text-gray-400">{item.resource_type}</span>
                    <span className="text-gray-700 ml-1.5 font-mono">{item.resource_id.slice(0, 8)}…</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs font-mono hidden lg:table-cell">
                    {item.ip_address ?? '—'}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <DetailCell detail={item.detail} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Showing {skip + 1}–{Math.min(skip + LIMIT, total)} of {total}</span>
          <div className="flex gap-2">
            <button
              disabled={skip === 0}
              onClick={() => handlePage(skip - LIMIT)}
              className="px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <button
              disabled={skip + LIMIT >= total}
              onClick={() => handlePage(skip + LIMIT)}
              className="px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
