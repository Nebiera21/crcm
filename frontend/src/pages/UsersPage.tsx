import { useEffect, useState, type FormEvent } from 'react'
import { Eye, EyeOff, Pencil, Plus, Trash2, UserCog } from 'lucide-react'
import apiClient from '@/lib/apiClient'
import { useAuthStore } from '@/store/authStore'
import type { Role } from '@/types/auth'

interface UserItem {
  id: string
  username: string
  email: string
  role: Role
  is_active: boolean
  created_at: string
}

const ROLES: Role[] = ['admin', 'operator', 'readonly']

const roleBadge: Record<Role, string> = {
  admin: 'bg-red-900/40 text-red-300 border-red-800',
  operator: 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  readonly: 'bg-gray-800 text-gray-400 border-gray-700',
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────

interface UserModalProps {
  existing?: UserItem
  onClose: () => void
  onSaved: () => void
}

function UserModal({ existing, onClose, onSaved }: UserModalProps) {
  const isEdit = !!existing
  const [username, setUsername] = useState(existing?.username ?? '')
  const [email, setEmail] = useState(existing?.email ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>(existing?.role ?? 'readonly')
  const [isActive, setIsActive] = useState(existing?.is_active ?? true)
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!isEdit) {
      if (!username.trim()) return setError('Username is required.')
      if (!email.trim()) return setError('Email is required.')
      if (!password) return setError('Password is required.')
    }

    setSaving(true)
    try {
      if (isEdit) {
        const body: Record<string, unknown> = { role, is_active: isActive }
        if (email !== existing!.email) body.email = email.trim()
        if (password) body.password = password
        await apiClient.put(`/users/${existing!.id}`, body)
      } else {
        await apiClient.post('/users/', {
          username: username.trim(),
          email: email.trim(),
          password,
          role,
        })
      }
      onSaved()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to save user.'
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
          {isEdit ? `Edit — ${existing!.username}` : 'Add User'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="john"
                autoComplete="off"
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              autoComplete="off"
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Password
              {isEdit && <span className="text-gray-500 font-normal"> (leave blank to keep current)</span>}
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? '••••••••' : 'Min. 8 characters'}
                autoComplete="new-password"
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 pr-10 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {isEdit && (
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 accent-brand-500"
              />
              <span className="text-sm text-gray-300">Active</span>
            </label>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteModal({
  user,
  onClose,
  onDeleted,
}: {
  user: UserItem
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setDeleting(true)
    try {
      await apiClient.delete(`/users/${user.id}`)
      onDeleted()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to delete user.'
      setError(String(msg))
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white mb-2">Delete User</h2>
        <p className="text-sm text-gray-400 mb-5">
          Delete <span className="text-white font-medium">{user.username}</span>? This action cannot be undone.
        </p>
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { user: me } = useAuthStore()
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | 'delete' | null>(null)
  const [selected, setSelected] = useState<UserItem | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await apiClient.get<UserItem[]>('/users/')
      setUsers(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openEdit(u: UserItem) { setSelected(u); setModal('edit') }
  function openDelete(u: UserItem) { setSelected(u); setModal('delete') }
  function closeModal() { setModal(null); setSelected(null) }
  function afterSave() { closeModal(); load() }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage user accounts and roles.</p>
        </div>
        <button
          onClick={() => setModal('add')}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {loading ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center text-gray-600 text-sm">
          Loading…
        </div>
      ) : users.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center text-gray-600 text-sm">
          No users found.
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-600 uppercase tracking-wider">
                <th className="px-4 py-3 text-left font-medium">Username</th>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Email</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Status</th>
                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Created</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.id === me?.id
                return (
                  <tr key={u.id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{u.username}</span>
                        {isMe && (
                          <span className="text-xs text-brand-400 bg-brand-900/30 border border-brand-800 px-1.5 py-0.5 rounded">you</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${roleBadge[u.role]}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {u.is_active ? (
                        <span className="text-xs text-green-400">Active</span>
                      ) : (
                        <span className="text-xs text-gray-600">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEdit(u)}
                          title="Edit user"
                          className="p-1.5 text-gray-500 hover:text-white transition rounded"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openDelete(u)}
                          disabled={isMe}
                          title={isMe ? "Cannot delete your own account" : "Delete user"}
                          className="p-1.5 text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-gray-600 pt-1">
        <UserCog className="w-3.5 h-3.5" />
        <span>{users.length} user{users.length !== 1 ? 's' : ''} total</span>
      </div>

      {modal === 'add' && <UserModal onClose={closeModal} onSaved={afterSave} />}
      {modal === 'edit' && selected && <UserModal existing={selected} onClose={closeModal} onSaved={afterSave} />}
      {modal === 'delete' && selected && <DeleteModal user={selected} onClose={closeModal} onDeleted={afterSave} />}
    </div>
  )
}
