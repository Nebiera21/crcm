import { useEffect, useState, type FormEvent } from 'react'
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Plus,
  Server,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import {
  createSshCredential,
  deleteSshCredential,
  getGlobalCredentials,
  listSshCredentials,
  updateGlobalCredentials,
  updateSshCredential,
} from '@/services/credentialsService'
import type { CredentialsStatus, SshCredentialCreate, SshCredentialItem, SshCredentialUpdate } from '@/types/credentials'

// ── SSH Credential modal (add / edit) ────────────────────────────────────────

interface CredModalProps {
  existing?: SshCredentialItem
  onClose: () => void
  onSaved: () => void
}

function CredModal({ existing, onClose, onSaved }: CredModalProps) {
  const isEdit = !!existing
  const [name, setName] = useState(existing?.name ?? '')
  const [username, setUsername] = useState(existing?.username ?? '')
  const [password, setPassword] = useState('')
  const [enablePassword, setEnablePassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showEnable, setShowEnable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Name is required.')
    if (!username.trim()) return setError('Username is required.')
    if (!isEdit && !password) return setError('Password is required.')

    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        const body: SshCredentialUpdate = {}
        if (name !== existing!.name) body.name = name.trim()
        if (username !== existing!.username) body.username = username.trim()
        if (password) body.password = password
        if (enablePassword) body.enable_password = enablePassword
        await updateSshCredential(existing!.id, body)
      } else {
        const body: SshCredentialCreate = {
          name: name.trim(),
          username: username.trim(),
          password,
          enable_password: enablePassword || undefined,
        }
        await createSshCredential(body)
      }
      onSaved()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to save credential.'
      setError(String(msg))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white mb-5">
          {isEdit ? 'Edit Credential' : 'Add Credential'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Branch-Office"
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">SSH Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="cisco"
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              SSH Password{isEdit && <span className="text-gray-500 font-normal"> (leave blank to keep current)</span>}
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? '••••••••' : 'Enter password'}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 pr-10 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Enable Password <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <input
                type={showEnable ? 'text' : 'password'}
                value={enablePassword}
                onChange={(e) => setEnablePassword(e.target.value)}
                placeholder={isEdit && existing?.has_enable_password ? '••••••••' : 'Not required'}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 pr-10 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button type="button" onClick={() => setShowEnable(!showEnable)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition">
                {showEnable ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

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
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Credential'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteModal({ cred, onClose, onDeleted }: { cred: SshCredentialItem; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setDeleting(true)
    try {
      await deleteSshCredential(cred.id)
      onDeleted()
    } catch {
      setError('Failed to delete credential.')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white mb-2">Delete Credential</h2>
        <p className="text-sm text-gray-400 mb-5">
          Delete <span className="text-white font-medium">{cred.name}</span>?{' '}
          {cred.router_count > 0 && (
            <span className="text-yellow-400">
              {cred.router_count} router{cred.router_count !== 1 ? 's' : ''} use this credential and will fall back to the global default.
            </span>
          )}
        </p>
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Cancel</button>
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

// ── Global credential form ────────────────────────────────────────────────────

function GlobalCredentialsSection() {
  const [status, setStatus] = useState<CredentialsStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [enablePassword, setEnablePassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showEnable, setShowEnable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getGlobalCredentials()
      .then((s) => {
        setStatus(s)
        if (s.username) setUsername(s.username)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim()) return setError('Username is required.')
    if (!password) return setError('Password is required.')
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const updated = await updateGlobalCredentials({
        username: username.trim(),
        password,
        enable_password: enablePassword || undefined,
      })
      setStatus(updated)
      setPassword('')
      setEnablePassword('')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Failed to save credentials.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-white">Global Default Credential</h2>
      </div>
      <p className="text-xs text-gray-500 mb-5">
        Used for routers that don't have a specific credential assigned.
      </p>

      {!loading && (
        <div className={`flex items-start gap-3 p-3 rounded-xl border mb-5 ${
          status?.is_configured ? 'bg-green-900/20 border-green-800' : 'bg-yellow-900/20 border-yellow-800'
        }`}>
          {status?.is_configured ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
              <p className="text-xs text-green-300">
                Username: <span className="font-mono">{status.username}</span>
                {' · '}Enable password: {status.has_enable_password ? 'set' : 'not set'}
              </p>
            </>
          ) : (
            <>
              <ShieldAlert className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-xs text-yellow-300">No global credential configured.</p>
            </>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">SSH Username</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            placeholder="cisco"
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">SSH Password</label>
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={status?.is_configured ? '••••••••' : 'Enter password'}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 pr-10 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition">
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Enable Password <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <div className="relative">
            <input type={showEnable ? 'text' : 'password'} value={enablePassword} onChange={(e) => setEnablePassword(e.target.value)}
              placeholder={status?.has_enable_password ? '••••••••' : 'Not required'}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 pr-10 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <button type="button" onClick={() => setShowEnable(!showEnable)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition">
              {showEnable ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
        {saved && (
          <p className="text-sm text-green-400 bg-green-900/20 border border-green-800 rounded-lg px-3 py-2 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />Credentials saved successfully.
          </p>
        )}
        <div className="flex justify-end pt-1">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition">
            {saving ? 'Saving…' : 'Save Credentials'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CredentialsPage() {
  const [creds, setCreds] = useState<SshCredentialItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | 'delete' | null>(null)
  const [selected, setSelected] = useState<SshCredentialItem | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await listSshCredentials()
      setCreds(res.items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openEdit(c: SshCredentialItem) { setSelected(c); setModal('edit') }
  function openDelete(c: SshCredentialItem) { setSelected(c); setModal('delete') }
  function closeModal() { setModal(null); setSelected(null) }
  function afterSave() { closeModal(); load() }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">SSH Credentials</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Manage named credential sets. Assign one to each router, or rely on the global default.
        </p>
      </div>

      {/* Named credential sets */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Named credentials</h2>
          <button
            onClick={() => setModal('add')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>

        {loading ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-600 text-sm">
            Loading…
          </div>
        ) : creds.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-600 text-sm">
            No named credentials yet. Add one to assign specific credentials per router.
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-gray-600 uppercase tracking-wider">
                  <th className="px-4 py-2.5 text-left font-medium">Name</th>
                  <th className="px-4 py-2.5 text-left font-medium">Username</th>
                  <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">Enable pw</th>
                  <th className="px-4 py-2.5 text-left font-medium hidden md:table-cell">Routers</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {creds.map((c) => (
                  <tr key={c.id} className="border-b border-gray-800/50 last:border-0">
                    <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs">{c.username}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {c.has_enable_password
                        ? <span className="text-green-400 text-xs">set</span>
                        : <span className="text-gray-600 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <Server className="w-3 h-3" />{c.router_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => openEdit(c)}
                          className="p-1.5 text-gray-500 hover:text-white transition rounded">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openDelete(c)}
                          className="p-1.5 text-gray-500 hover:text-red-400 transition rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Global fallback */}
      <GlobalCredentialsSection />

      {/* Modals */}
      {modal === 'add' && <CredModal onClose={closeModal} onSaved={afterSave} />}
      {modal === 'edit' && selected && <CredModal existing={selected} onClose={closeModal} onSaved={afterSave} />}
      {modal === 'delete' && selected && <DeleteModal cred={selected} onClose={closeModal} onDeleted={afterSave} />}
    </div>
  )
}
