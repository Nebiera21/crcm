import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, Pencil, Plus, RotateCcw, Search, Trash2, Upload, Wifi, XCircle } from 'lucide-react'
import {
  createRouter,
  deleteRouter,
  importRouters,
  listRouters,
  updateRouter,
} from '@/services/routerService'
import { testConnection } from '@/services/monitorService'
import { listSshCredentials } from '@/services/credentialsService'
import { useAuthStore } from '@/store/authStore'
import type { ImportResult, Router, RouterCreate } from '@/types/router'
import type { SshCredentialItem } from '@/types/credentials'

interface TestState {
  loading: boolean
  ok?: boolean
  msg?: string
  ms?: number | null
}

const PAGE_SIZE = 50

// ── helpers ──────────────────────────────────────────────────────────────────

function isValidIP(ip: string): boolean {
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/
  if (v4.test(ip)) return ip.split('.').every((o) => parseInt(o) <= 255)
  // basic IPv6 check
  return /^[0-9a-fA-F:]+$/.test(ip) && ip.includes(':')
}

// ── Modal: Add / Edit router ─────────────────────────────────────────────────

interface RouterFormModalProps {
  router?: Router
  onClose: () => void
  onSaved: () => void
}

function RouterFormModal({ router: existing, onClose, onSaved }: RouterFormModalProps) {
  const isEdit = !!existing
  const [form, setForm] = useState({
    hostname: existing?.hostname ?? '',
    ip_address: existing?.ip_address ?? '',
    location: existing?.location ?? '',
    model: existing?.model ?? '',
    snmp_community: existing?.snmp_community ?? '',
    notes: existing?.notes ?? '',
    is_active: existing?.is_active ?? true,
    credential_id: existing?.credential_id ?? '',
    wan_ip_address: existing?.wan_ip_address ?? '',
    wan_ssh_port: existing?.wan_ssh_port != null ? String(existing.wan_ssh_port) : '',
    use_wan_ip: existing?.use_wan_ip ?? false,
  })
  const [sshCreds, setSshCreds] = useState<SshCredentialItem[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listSshCredentials().then((r) => setSshCreds(r.items)).catch(() => {})
  }, [])

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.hostname.trim()) return setError('Hostname is required.')
    if (!form.ip_address.trim()) return setError('IP address is required.')
    if (!isValidIP(form.ip_address.trim())) return setError('Invalid IP address.')

    setSaving(true)
    setError('')
    try {
      const wanPort = form.wan_ssh_port.trim() ? parseInt(form.wan_ssh_port.trim(), 10) : null
      const payload: RouterCreate = {
        hostname: form.hostname.trim(),
        ip_address: form.ip_address.trim(),
        location: form.location.trim() || null,
        model: form.model.trim() || null,
        snmp_community: form.snmp_community.trim() || null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
        credential_id: form.credential_id || null,
        wan_ip_address: form.wan_ip_address.trim() || null,
        wan_ssh_port: wanPort,
        use_wan_ip: form.use_wan_ip,
      }
      if (isEdit) {
        await updateRouter(existing!.id, payload)
      } else {
        await createRouter(payload)
      }
      onSaved()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to save router.'
      setError(String(msg))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white mb-5">
          {isEdit ? 'Edit Router' : 'Add Router'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Hostname *" value={form.hostname} onChange={(v) => set('hostname', v)} placeholder="router-hq-01" />
            <Field label="IP Address *" value={form.ip_address} onChange={(v) => set('ip_address', v)} placeholder="192.168.1.1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Location" value={form.location} onChange={(v) => set('location', v)} placeholder="Headquarters" />
            <Field label="Model" value={form.model} onChange={(v) => set('model', v)} placeholder="Cisco 867VAE" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              SSH Credential <span className="text-gray-500 font-normal">(optional — uses global default if unset)</span>
            </label>
            <select
              value={form.credential_id}
              onChange={(e) => set('credential_id', e.target.value)}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Global default</option>
              {sshCreds.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.username})</option>
              ))}
            </select>
          </div>
          <Field label="SNMP Community" value={form.snmp_community} onChange={(v) => set('snmp_community', v)} placeholder="public" />

          {/* WAN IP section */}
          <div className="border border-gray-700 rounded-lg p-3 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">WAN Fallback (SSH)</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="WAN IP Address" value={form.wan_ip_address} onChange={(v) => set('wan_ip_address', v)} placeholder="203.0.113.1" />
              </div>
              <Field label="SSH Port" value={form.wan_ssh_port} onChange={(v) => set('wan_ssh_port', v)} placeholder="22" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.use_wan_ip}
                onChange={(e) => set('use_wan_ip', e.target.checked)}
                className="w-4 h-4 accent-brand-600"
              />
              <span className="text-sm text-gray-300">Use WAN IP as fallback on connection timeout</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Optional notes…"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set('is_active', e.target.checked)}
              className="w-4 h-4 accent-brand-600"
            />
            <span className="text-sm text-gray-300">Active</span>
          </label>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Router'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  )
}

// ── Modal: Delete confirmation ────────────────────────────────────────────────

function DeleteModal({ router, onClose, onDeleted }: { router: Router; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setDeleting(true)
    try {
      await deleteRouter(router.id)
      onDeleted()
    } catch {
      setError('Failed to delete router.')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white mb-2">Delete Router</h2>
        <p className="text-sm text-gray-400 mb-5">
          Are you sure you want to delete{' '}
          <span className="text-white font-medium">{router.hostname}</span>{' '}
          ({router.ip_address})? This cannot be undone.
        </p>
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={deleting}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Import ─────────────────────────────────────────────────────────────

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const res = await importRouters(file)
      setResult(res)
      onDone()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Import failed.'
      setError(String(msg))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white mb-1">Import Routers</h2>
        <p className="text-sm text-gray-400 mb-5">
          Upload a <code className="text-gray-300">.csv</code> or{' '}
          <code className="text-gray-300">.xlsx</code> file. Required:{' '}
          <code className="text-gray-300">hostname</code>, <code className="text-gray-300">ip_address</code>.{' '}
          Optional: location, model, notes, wan_ip_address, wan_ssh_port, use_wan_ip.
        </p>

        <div
          className="border-2 border-dashed border-gray-700 hover:border-gray-600 rounded-xl p-8 text-center cursor-pointer transition mb-4"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-gray-500 mx-auto mb-2" />
          {file ? (
            <p className="text-sm text-white font-medium">{file.name}</p>
          ) : (
            <p className="text-sm text-gray-500">Click to select file</p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {result && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              {result.created} router{result.created !== 1 ? 's' : ''} created
            </div>
            {result.skipped_duplicate > 0 && (
              <p className="text-sm text-yellow-400">{result.skipped_duplicate} skipped (duplicate IP)</p>
            )}
            {result.errors.length > 0 && (
              <div className="text-sm text-red-400 space-y-0.5">
                {result.errors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition"
            >
              {uploading ? 'Importing…' : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const [routers, setRouters] = useState<Router[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined)
  const [page, setPage] = useState(0)

  const [showAdd, setShowAdd] = useState(false)
  const [editRouter, setEditRouter] = useState<Router | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Router | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [testStates, setTestStates] = useState<Record<string, TestState>>({})

  async function handleTest(r: Router) {
    setTestStates((prev) => ({ ...prev, [r.id]: { loading: true } }))
    try {
      const res = await testConnection(r.id)
      setTestStates((prev) => ({
        ...prev,
        [r.id]: { loading: false, ok: res.success, msg: res.message, ms: res.latency_ms },
      }))
    } catch {
      setTestStates((prev) => ({
        ...prev,
        [r.id]: { loading: false, ok: false, msg: 'Request failed' },
      }))
    }
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await listRouters({
        search: search || undefined,
        is_active: activeFilter,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      })
      setRouters(res.items)
      setTotal(res.total)
    } catch {
      setError('Failed to load routers.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [search, activeFilter, page])

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Router Inventory</h1>
          <p className="text-sm text-gray-400 mt-0.5">{total} router{total !== 1 ? 's' : ''} total</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              Add Router
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search hostname, IP, location…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select
          value={activeFilter === undefined ? '' : String(activeFilter)}
          onChange={(e) => {
            setActiveFilter(e.target.value === '' ? undefined : e.target.value === 'true')
            setPage(0)
          }}
          className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All status</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {error && (
          <div className="flex items-center gap-2 px-6 py-3 bg-red-900/20 border-b border-red-800 text-sm text-red-400">
            <XCircle className="w-4 h-4" />
            {error}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <Th>Hostname</Th>
                <Th>IP Address</Th>
                <Th>WAN IP</Th>
                <Th>Location</Th>
                <Th>Model</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && routers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    {search ? 'No routers match your search.' : 'No routers yet. Add your first router or import from CSV.'}
                  </td>
                </tr>
              )}
              {!loading && routers.map((r) => {
                const ts = testStates[r.id]
                return (
                  <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-3 font-medium text-white">{r.hostname}</td>
                    <td className="px-6 py-3 font-mono text-gray-300">{r.ip_address}</td>
                    <td className="px-6 py-3 font-mono text-gray-400">
                      {r.wan_ip_address ? (
                        <span className={r.use_wan_ip ? 'text-amber-400' : 'text-gray-500'} title={r.use_wan_ip ? 'WAN fallback enabled' : 'WAN fallback disabled'}>
                          {r.wan_ip_address}
                          {r.wan_ssh_port && r.wan_ssh_port !== 22 ? `:${r.wan_ssh_port}` : ''}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-6 py-3 text-gray-400">{r.location ?? '—'}</td>
                    <td className="px-6 py-3 text-gray-400">{r.model ?? '—'}</td>
                    <td className="px-6 py-3">
                      {r.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {/* Test connection result */}
                        {ts && !ts.loading && (
                          <span className={`text-xs font-mono ${ts.ok ? 'text-green-400' : 'text-red-400'}`}>
                            {ts.ok ? `${ts.ms}ms` : 'failed'}
                          </span>
                        )}
                        {/* Test button */}
                        <button
                          onClick={() => handleTest(r)}
                          disabled={ts?.loading}
                          title={ts?.msg ?? 'Test SSH connection'}
                          className="p-1.5 rounded transition text-gray-500 hover:text-brand-400 hover:bg-brand-900/20 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {ts?.loading ? (
                            <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Wifi className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {isAdmin && (
                          <>
                            <IconBtn onClick={() => setEditRouter(r)} title="Edit">
                              <Pencil className="w-3.5 h-3.5" />
                            </IconBtn>
                            <IconBtn onClick={() => setDeleteTarget(r)} title="Delete" danger>
                              <Trash2 className="w-3.5 h-3.5" />
                            </IconBtn>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-800 text-sm text-gray-400">
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
                className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && (
        <RouterFormModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); void load() }}
        />
      )}
      {editRouter && (
        <RouterFormModal
          router={editRouter}
          onClose={() => setEditRouter(null)}
          onSaved={() => { setEditRouter(null); void load() }}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          router={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); void load() }}
        />
      )}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onDone={() => { void load() }}
        />
      )}
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th className={`px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition ${danger ? 'text-gray-500 hover:text-red-400 hover:bg-red-900/20' : 'text-gray-500 hover:text-white hover:bg-gray-700'}`}
    >
      {children}
    </button>
  )
}
