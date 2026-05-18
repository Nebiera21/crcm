import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, Eye, EyeOff, KeyRound, ShieldAlert } from 'lucide-react'
import { getCredentials, updateCredentials } from '@/services/credentialsService'
import type { CredentialsStatus } from '@/types/credentials'

export default function CredentialsPage() {
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
    getCredentials()
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
      const updated = await updateCredentials({
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
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">SSH Credentials</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Global credentials used to connect to all routers via Netmiko.
        </p>
      </div>

      {/* Status card */}
      {!loading && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border mb-6 ${
          status?.is_configured
            ? 'bg-green-900/20 border-green-800'
            : 'bg-yellow-900/20 border-yellow-800'
        }`}>
          {status?.is_configured ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="text-green-300 font-medium">Credentials configured</p>
                <p className="text-green-400/70 mt-0.5">
                  Username: <span className="font-mono text-green-300">{status.username}</span>
                  {' · '}
                  Enable password: {status.has_enable_password ? 'set' : 'not set'}
                  {status.updated_at && (
                    <> · Last updated: {new Date(status.updated_at).toLocaleString()}</>
                  )}
                </p>
              </div>
            </>
          ) : (
            <>
              <ShieldAlert className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="text-yellow-300 font-medium">No credentials set</p>
                <p className="text-yellow-400/70 mt-0.5">
                  SSH connections to routers will fail until credentials are configured.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Form */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <KeyRound className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-white">
            {status?.is_configured ? 'Update Credentials' : 'Set Credentials'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <label className="block text-sm font-medium text-gray-300 mb-1.5">SSH Password</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={status?.is_configured ? '••••••••' : 'Enter password'}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 pr-10 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Enable Password <span className="text-gray-500 font-normal">(optional — for privileged mode)</span>
            </label>
            <div className="relative">
              <input
                type={showEnable ? 'text' : 'password'}
                value={enablePassword}
                onChange={(e) => setEnablePassword(e.target.value)}
                placeholder={status?.has_enable_password ? '••••••••' : 'Not required'}
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 pr-10 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => setShowEnable(!showEnable)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition"
              >
                {showEnable ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>
          )}
          {saved && (
            <p className="text-sm text-green-400 bg-green-900/20 border border-green-800 rounded-lg px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Credentials saved successfully.
            </p>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition"
            >
              {saving ? 'Saving…' : 'Save Credentials'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
