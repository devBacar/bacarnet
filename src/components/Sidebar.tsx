import {
  BookUser,
  CalendarClock,
  FileText,
  HardDrive,
  Home,
  LayoutDashboard,
  ScrollText,
  Settings,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context'
import { isSuperAdmin } from '../services/userService'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-brand-primary text-white'
      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-gray-100'
  }`

const NAV_ITEMS: {
  to: string
  end?: boolean
  label: string
  icon: LucideIcon
}[] = [
  { to: '/intranet', label: 'Intranet', icon: Home },
  { to: '/admin', end: true, label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/content', label: 'Contenido', icon: FileText },
  { to: '/admin/directory', label: 'Contactos', icon: BookUser },
  { to: '/admin/shifts', label: 'Turnos', icon: CalendarClock },
  { to: '/admin/resources', label: 'Archivos', icon: HardDrive },
  { to: '/admin/users', label: 'Configuración y usuarios', icon: Settings },
]

function useAdminNavItems() {
  const { userProfile } = useAuth()
  return isSuperAdmin(userProfile)
    ? [
        ...NAV_ITEMS,
        { to: '/admin/rag-pilot', label: 'Piloto RAG', icon: Sparkles },
        { to: '/admin/auditoria', label: 'Auditoría', icon: ScrollText },
      ]
    : NAV_ITEMS
}

function AdminSidebarPanel({
  email,
  onNavigate,
  onLogout,
}: {
  email: string | null | undefined
  onNavigate?: () => void
  onLogout: () => void
}) {
  const items = useAdminNavItems()

  return (
    <>
      <div className="flex items-start justify-between gap-2 border-b border-neutral-200 px-4 py-4 dark:border-zinc-800 lg:px-6 lg:py-5">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-neutral-900 dark:text-gray-100">Panel Admin</p>
          <p className="mt-1 truncate text-xs text-neutral-500 dark:text-gray-400">{email}</p>
        </div>
        {onNavigate ? (
          <button
            type="button"
            onClick={onNavigate}
            aria-label="Cerrar menú"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-zinc-800 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <nav className="app-drawer-scroll flex flex-1 flex-col gap-1 p-3 lg:p-4">
        {items.map(({ to, end, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={end} className={navLinkClass} onClick={onNavigate}>
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-neutral-200 p-3 dark:border-zinc-800 lg:p-4">
        <button
          type="button"
          onClick={onLogout}
          className="flex min-h-11 w-full items-center justify-center rounded-lg border border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:bg-white dark:border-zinc-700 dark:text-gray-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
        >
          Cerrar sesión
        </button>
      </div>
    </>
  )
}

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const { user, logout } = useAuth()
  const location = useLocation()

  useEffect(() => {
    onMobileClose?.()
  }, [location.pathname, onMobileClose])

  useEffect(() => {
    if (!mobileOpen) return

    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onMobileClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.documentElement.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [mobileOpen, onMobileClose])

  const handleLogout = () => {
    onMobileClose?.()
    void logout()
  }

  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 lg:flex">
        <AdminSidebarPanel email={user?.email} onLogout={handleLogout} />
      </aside>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-[60] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menú del panel admin"
        >
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-neutral-900/40"
            onClick={onMobileClose}
          />

          <aside className="app-drawer-aside absolute inset-y-0 left-0 flex w-full max-w-[min(100%,20rem)] flex-col shadow-2xl">
            <AdminSidebarPanel
              email={user?.email}
              onNavigate={onMobileClose}
              onLogout={handleLogout}
            />
          </aside>
        </div>
      ) : null}
    </>
  )
}
