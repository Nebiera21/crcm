import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import { listRouters } from '@/services/routerService'
import { getHistory, listHistory, rollback } from '@/services/deployService'
import { getTaskStatus } from '@/services/monitorService'
import { useAuthStore } from '@/store/authStore'
import type { Router } from '@/types/router'
import type { DeployStatus, HistoryDetail, HistoryListItem } from '@/types/deploy'

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<DeployStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  pending: { label: 'Pending', cls: 'bg-gray-800 text-gray-400', icon: <Clock className="w-3 h-3" /> },
  success: { label: 'Success', cls: 'bg-green-900/40 text-green-300', icon: <CheckCircle className="w-3 h-3" /> },
  failed: { label: 'Failed', cls: 'bg-red-900/40 text-red-300', icon: <XCircle className="w-3 h-3" /> },
  rolled_back: { label: 'Rolled back', cls: 'bg-yellow-900/40 text-yellow-300', icon: <RotateCcw className="w-3 h-3" /> },
}

function StatusBadge({ status }: { status: DeployStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${cfg.cls}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Detail drawer
// ---------------------------------------------------------------------------

function DetailDrawer({
  historyId,
  onClose,
  onRollbackDone,
  canRollback: canRollbackProp,
}: {
  historyId: string
  onClose: () => void
  onRollbackDone: () => void
  canRollback: boolean
}) {
  const { user } = useAuthStore()
  const canActRollback = canRollbackProp && (user?.role === 'admin' || user?.role === 'operator')

  const [detail, setDetail] = useState<HistoryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmRollback, setConfirmRollback] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [rollbackJobId, setRollbackJobId] = useState<string | null>(null)
  const [rollbackStatus, setRollbackStatus] = useState<'running' | 'done' | 'error' | null>(null)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [outputOpen, setOutputOpen] = useState(true)

  useEffect(() => {
    getHistory(historyId)
      .then(setDetail)
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [historyId])

  async function handleRollback() {
    if (!detail) return
    setRolling(true)
    try {
      const res = await rollback(detail.id)
      setRollbackJobId(res.job_id)
      setRollbackStatus('running')
      setConfirmRollback(false)

      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const s = await getTaskStatus(res.job_id)
          if (s.state === 'SUCCESS') {
            clearInterval(poll)
            setRollbackStatus('done')
            onRollbackDone()
          } else if (s.state === 'FAILURE') {
            clearInterval(poll)
            setRollbackStatus('error')
          }
        } catch {}
      }, 2000)
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? 'Rollback failed')
    } finally {
      setRolling(false)
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 w-[560px] z-40 flex flex-col bg-gray-900 border-l border-gray-800 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
        <div>
          <p className="font-semibold text-white">{detail?.router_hostname ?? '…'}</p>
          <p className="text-xs text-gray-500 font-mono mt-0.5">{historyId}</p>
        </div>
        <div className="flex items-center gap-3">
          {detail && <StatusBadge status={detail.status} />}
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Rollback bar */}
      {canActRollback && detail && !rollbackJobId && (
        <div className="px-5 py-3 border-b border-gray-800 shrink-0 flex items-center justify-between bg-gray-950/50">
          <p className="text-xs text-gray-500">Restore the config that existed before this deployment.</p>
          <button
            onClick={() => setConfirmRollback(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-yellow-300 border border-yellow-700/50 hover:bg-yellow-900/20 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Rollback
          </button>
        </div>
      )}

      {rollbackJobId && (
        <div className={`px-5 py-3 border-b border-gray-800 shrink-0 flex items-center gap-2 text-sm ${rollbackStatus === 'done' ? 'text-green-300' : rollbackStatus === 'error' ? 'text-red-300' : 'text-gray-400'}`}>
          {rollbackStatus === 'running' && <Loader2 className="w-4 h-4 animate-spin" />}
          {rollbackStatus === 'done' && <CheckCircle className="w-4 h-4" />}
          {rollbackStatus === 'error' && <XCircle className="w-4 h-4" />}
          {rollbackStatus === 'running' ? 'Rollback in progress…' : rollbackStatus === 'done' ? 'Rollback completed' : 'Rollback failed'}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-5 space-y-4">
        {loading ? (
          <div className="text-center py-12 text-gray-600">Loading…</div>
        ) : !detail ? (
          <div className="text-center py-12 text-gray-600">Failed to load details.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Router</p>
                <p className="text-white font-medium">{detail.router_hostname}</p>
                <p className="text-gray-500 text-xs font-mono">{detail.router_ip}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Deployed</p>
                <p className="text-white">{new Date(detail.deployed_at).toLocaleString()}</p>
              </div>
              {detail.connected_via && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Connected via</p>
                  {detail.connected_via === 'wan' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 bg-amber-900/20 border border-amber-700/40 rounded px-2 py-0.5">
                      WAN IP (fallback)
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Internal IP</span>
                  )}
                </div>
              )}
            </div>

            {detail.rendered_config && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Rendered config</p>
                <pre className="bg-gray-950 rounded-lg border border-gray-800 p-3 text-xs font-mono text-green-300 whitespace-pre overflow-x-auto max-h-56">
                  {detail.rendered_config}
                </pre>
              </div>
            )}

            {detail.output && (
              <div>
                <button
                  onClick={() => setOutputOpen((o) => !o)}
                  className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-300 transition-colors"
                >
                  {outputOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  Router output
                </button>
                {outputOpen && (
                  <pre className="bg-gray-950 rounded-lg border border-gray-800 p-3 text-xs font-mono text-gray-300 whitespace-pre overflow-x-auto max-h-56">
                    {detail.output}
                  </pre>
                )}
              </div>
            )}

            {detail.config_snapshot && (
              <div>
                <button
                  onClick={() => setSnapshotOpen((o) => !o)}
                  className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-300 transition-colors"
                >
                  {snapshotOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  Pre-deploy snapshot
                </button>
                {snapshotOpen && (
                  <pre className="bg-gray-950 rounded-lg border border-gray-800 p-3 text-xs font-mono text-gray-400 whitespace-pre overflow-x-auto max-h-56">
                    {detail.config_snapshot}
                  </pre>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Rollback confirm modal */}
      {confirmRollback && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-6 z-10">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white">Confirm rollback</p>
                <p className="text-sm text-gray-400 mt-1">
                  This will push the pre-deploy snapshot to <strong className="text-white">{detail?.router_hostname}</strong>, restoring the config that existed before this deployment.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmRollback(false)}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRollback}
                disabled={rolling}
                className="px-4 py-2 rounded-lg bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {rolling ? 'Starting…' : 'Confirm rollback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [routers, setRouters] = useState<Router[]>([])
  const [filterRouter, setFilterRouter] = useState('')
  const [filterStatus, setFilterStatus] = useState<DeployStatus | ''>('')
  const [skip, setSkip] = useState(0)
  const [detailId, setDetailId] = useState<string | null>(null)
  const LIMIT = 50

  async function load(s = 0) {
    setLoading(true)
    try {
      const res = await listHistory({
        router_id: filterRouter || undefined,
        status: filterStatus || undefined,
        skip: s,
        limit: LIMIT,
      })
      setItems(res.items)
      setTotal(res.total)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => {
    listRouters({ is_active: true, limit: 200 }).then((r) => setRouters(r.items)).catch(() => null)
  }, [])

  useEffect(() => {
    setSkip(0)
    load(0)
  }, [filterRouter, filterStatus])

  function handlePage(n: number) {
    setSkip(n)
    load(n)
  }

  const detailItem = items.find((i) => i.id === detailId)

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Deploy History</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} deployment{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 outline-none focus:border-brand-600 transition-colors"
          value={filterRouter}
          onChange={(e) => setFilterRouter(e.target.value)}
        >
          <option value="">All routers</option>
          {routers.map((r) => (
            <option key={r.id} value={r.id}>{r.hostname}</option>
          ))}
        </select>
        <select
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 outline-none focus:border-brand-600 transition-colors"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as DeployStatus | '')}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="rolled_back">Rolled back</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-5 py-3 text-left font-medium">Deployed at</th>
              <th className="px-5 py-3 text-left font-medium">Router</th>
              <th className="px-5 py-3 text-left font-medium">Status</th>
              <th className="px-5 py-3 text-left font-medium hidden md:table-cell">Template</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-600">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-600">No deployments found.</td></tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors cursor-pointer"
                  onClick={() => setDetailId(item.id)}
                >
                  <td className="px-5 py-3 text-gray-400 text-xs font-mono">
                    {new Date(item.deployed_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-medium text-white">{item.router_hostname ?? item.router_id}</span>
                    {item.router_ip && <span className="text-gray-500 text-xs ml-2">{item.router_ip}</span>}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs hidden md:table-cell">
                    {item.template_id ? <span className="font-mono">{item.template_id.slice(0, 8)}…</span> : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <ChevronRight className="w-4 h-4 text-gray-600 inline" />
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

      {/* Detail drawer + overlay */}
      {detailId && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/30"
            onClick={() => setDetailId(null)}
          />
          <DetailDrawer
            historyId={detailId}
            onClose={() => setDetailId(null)}
            onRollbackDone={() => { setDetailId(null); load(skip) }}
            canRollback={detailItem?.can_rollback ?? false}
          />
        </>
      )}
    </div>
  )
}
