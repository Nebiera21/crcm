import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  CheckCircle,
  Clock,
  FileCode2,
  RotateCcw,
  Send,
  Server,
  XCircle,
} from 'lucide-react'
import { getDashboardStats } from '@/services/statsService'
import { useAuthStore } from '@/store/authStore'
import type { DashboardStats, RecentDeployItem } from '@/types/stats'
import type { DeployStatus } from '@/types/deploy'

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string
  value: number | string
  sub?: string
  icon: React.ReactNode
  accent: string
}) {
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${accent}`}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-white leading-none">{value}</p>
        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deploy status badge (mini)
// ---------------------------------------------------------------------------

const STATUS_MINI: Record<DeployStatus, { cls: string; icon: React.ReactNode }> = {
  pending: { cls: 'text-gray-500', icon: <Clock className="w-3 h-3" /> },
  success: { cls: 'text-green-400', icon: <CheckCircle className="w-3 h-3" /> },
  failed: { cls: 'text-red-400', icon: <XCircle className="w-3 h-3" /> },
  rolled_back: { cls: 'text-yellow-400', icon: <RotateCcw className="w-3 h-3" /> },
}

function MiniStatusBadge({ status }: { status: DeployStatus }) {
  const cfg = STATUS_MINI[status]
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.cls}`}>
      {cfg.icon}
      {status.replace('_', ' ')}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Recent deploys table
// ---------------------------------------------------------------------------

function RecentDeploys({ items }: { items: RecentDeployItem[] }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600 text-sm bg-gray-900 rounded-xl border border-gray-800">
        No deployments yet.
      </div>
    )
  }
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-xs text-gray-600 uppercase tracking-wider">
            <th className="px-4 py-2.5 text-left font-medium">Router</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">When</th>
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr key={d.id} className="border-b border-gray-800/50 last:border-0">
              <td className="px-4 py-2.5">
                <span className="font-medium text-white">{d.router_hostname ?? '—'}</span>
                {d.router_ip && <span className="text-gray-600 text-xs ml-1.5">{d.router_ip}</span>}
              </td>
              <td className="px-4 py-2.5">
                <MiniStatusBadge status={d.status} />
              </td>
              <td className="px-4 py-2.5 text-gray-600 text-xs hidden sm:table-cell">
                {new Date(d.deployed_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quick link
// ---------------------------------------------------------------------------

function QuickLink({
  to,
  title,
  description,
  icon,
}: {
  to: string
  title: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className="flex items-start gap-4 p-4 bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl transition group"
    >
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white mb-0.5">{title}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition mt-0.5 shrink-0" />
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  const successRate =
    stats && stats.deploys_last_30d > 0
      ? Math.round((stats.deploys_success_last_30d / stats.deploys_last_30d) * 100)
      : null

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Welcome back, {user?.username}.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Routers"
          value={loading ? '—' : (stats?.routers_total ?? 0)}
          sub={loading ? undefined : `${stats?.routers_active ?? 0} active`}
          icon={<Server className="w-5 h-5 text-brand-400" />}
          accent="bg-brand-600/10 border-brand-800/50"
        />
        <StatCard
          label="Templates"
          value={loading ? '—' : (stats?.templates_total ?? 0)}
          icon={<FileCode2 className="w-5 h-5 text-purple-400" />}
          accent="bg-purple-900/20 border-purple-800/50"
        />
        <StatCard
          label="Deploys (30d)"
          value={loading ? '—' : (stats?.deploys_last_30d ?? 0)}
          sub={loading ? undefined : `${stats?.deploys_total ?? 0} all time`}
          icon={<Send className="w-5 h-5 text-blue-400" />}
          accent="bg-blue-900/20 border-blue-800/50"
        />
        <StatCard
          label="Success rate (30d)"
          value={loading ? '—' : (successRate !== null ? `${successRate}%` : '—')}
          sub={
            loading || !stats
              ? undefined
              : `${stats.deploys_success_last_30d} ok · ${stats.deploys_failed_last_30d} fail`
          }
          icon={<Activity className="w-5 h-5 text-green-400" />}
          accent="bg-green-900/20 border-green-800/50"
        />
      </div>

      {/* Recent activity */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Recent deployments</h2>
          <Link to="/history" className="text-xs text-brand-400 hover:text-brand-300 transition">
            View all →
          </Link>
        </div>
        <RecentDeploys items={stats?.recent_deploys ?? []} />
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Quick access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickLink
            to="/inventory"
            title="Router Inventory"
            description="View, add, and manage all routers."
            icon={<Server className="w-5 h-5 text-brand-400" />}
          />
          <QuickLink
            to="/deploy"
            title="Deploy Config"
            description="Push Jinja2 templates to live routers."
            icon={<Send className="w-5 h-5 text-blue-400" />}
          />
          <QuickLink
            to="/monitor"
            title="Monitor"
            description="Run show commands and poll SNMP metrics."
            icon={<Activity className="w-5 h-5 text-green-400" />}
          />
          <QuickLink
            to="/templates"
            title="Templates"
            description="Create and edit Jinja2 config templates."
            icon={<FileCode2 className="w-5 h-5 text-purple-400" />}
          />
          <QuickLink
            to="/history"
            title="History"
            description="Review past deployments and roll back."
            icon={<RotateCcw className="w-5 h-5 text-yellow-400" />}
          />
          {user?.role === 'admin' && (
            <QuickLink
              to="/credentials"
              title="SSH Credentials"
              description="Configure global SSH and enable password."
              icon={<Activity className="w-5 h-5 text-orange-400" />}
            />
          )}
        </div>
      </div>
    </div>
  )
}
