import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  ClipboardList,
  FileCode2,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Router,
  Send,
  Server,
  Users,
  X,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import type { Role } from '@/types/auth'

interface NavItem {
  label: string
  to?: string
  icon: React.ElementType
  disabled?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Inventory', to: '/inventory', icon: Server },
  { label: 'Templates', to: '/templates', icon: FileCode2 },
  { label: 'Deploy', to: '/deploy', icon: Send },
  { label: 'Monitor', to: '/monitor', icon: Activity },
  { label: 'History', to: '/history', icon: History },
  { label: 'Audit Log', to: '/audit', icon: ClipboardList },
]

const ADMIN_NAV: NavItem[] = [
  { label: 'Users', to: '/users', icon: Users },
  { label: 'Credentials', to: '/credentials', icon: KeyRound },
]

const roleColors: Record<Role, string> = {
  admin: 'bg-red-900/40 text-red-300',
  operator: 'bg-yellow-900/40 text-yellow-300',
  readonly: 'bg-gray-800 text-gray-400',
}

function NavItemEl({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const base =
    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full text-left'

  if (item.disabled) {
    return (
      <div className={`${base} text-gray-600 cursor-not-allowed`}>
        <item.icon className="w-4 h-4 shrink-0" />
        {item.label}
        <span className="ml-auto text-xs text-gray-700">soon</span>
      </div>
    )
  }

  return (
    <NavLink
      to={item.to!}
      onClick={onNavigate}
      className={({ isActive }) =>
        `${base} ${isActive ? 'bg-brand-600/20 text-brand-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`
      }
    >
      <item.icon className="w-4 h-4 shrink-0" />
      {item.label}
    </NavLink>
  )
}

// ---------------------------------------------------------------------------
// Sidebar content (shared between desktop sidebar and mobile drawer)
// ---------------------------------------------------------------------------

function SidebarContent({
  onNavigate,
  onLogout,
}: {
  onNavigate?: () => void
  onLogout: () => void
}) {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  return (
    <>
      {/* Brand */}
      <div className="px-4 py-4 border-b border-gray-800 flex items-center gap-2.5 shrink-0">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-brand-600 shrink-0">
          <Router className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-sm text-white tracking-wide">CRCM</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavItemEl key={item.label} item={item} onNavigate={onNavigate} />
        ))}

        {isAdmin && (
          <>
            <div className="pt-4 pb-1 px-3">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Admin</span>
            </div>
            {ADMIN_NAV.map((item) => (
              <NavItemEl key={item.label} item={item} onNavigate={onNavigate} />
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-gray-800 space-y-1 shrink-0">
        {user && (
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.username}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${roleColors[user.role]}`}>
                {user.role}
              </span>
            </div>
          </div>
        )}
        <button
          onClick={onLogout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuthStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* ── Desktop sidebar (md+) ─────────────────────────────────── */}
      <aside className="hidden md:flex w-60 shrink-0 bg-gray-900 border-r border-gray-800 flex-col">
        <SidebarContent onLogout={handleLogout} />
      </aside>

      {/* ── Mobile drawer overlay ────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 bg-gray-900 border-r border-gray-800 flex flex-col
          transition-transform duration-200 ease-in-out md:hidden
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="absolute top-3 right-3">
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <SidebarContent onNavigate={() => setMobileOpen(false)} onLogout={handleLogout} />
      </aside>

      {/* ── Content area ─────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900 shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-brand-600">
              <Router className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm text-white tracking-wide">CRCM</span>
          </div>
        </div>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
