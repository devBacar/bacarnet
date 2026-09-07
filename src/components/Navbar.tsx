import { LogOut, Moon, Sun } from 'lucide-react'
import { signOut } from 'firebase/auth'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { NotificationBell } from './NotificationBell'
import { useAuth, useTheme } from '../context'
import { useGlobalSettings } from '../context/GlobalSettingsContext'
import { auth } from '../services/firebase'
import { DEFAULT_PERMISSIONS, isExternalAccount, isSuperAdmin } from '../services/userService'
import { useBoardsVisibility } from '../hooks/useBoardsVisibility'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'nav-link-active'
      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-gray-100'
  }`

export function Navbar() {
  const navigate = useNavigate()
  const { userProfile } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const { settings } = useGlobalSettings()
  const permissions = userProfile?.permissions ?? DEFAULT_PERMISSIONS
  const externalAccount = isExternalAccount(userProfile)
  const canAccessAdmin = isSuperAdmin(userProfile)
  const canAccessAudit = isSuperAdmin(userProfile)
  const boardsVisible = useBoardsVisibility()
  const canAccessBoards = boardsVisible === true

  const handleLogout = async () => {
    await signOut(auth)
    navigate('/')
  }

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        backgroundColor: 'var(--color-navbar-bg)',
        borderColor: 'var(--color-navbar-border)',
      }}
    >
      <div className="layout-container flex flex-wrap items-center gap-4 !py-3">
        <Link to="/intranet" className="flex shrink-0 items-center gap-3">
          <img
            src="/logo-bacar.png"
            alt="Logo Bacar"
            className="h-9 w-9 object-contain"
          />
          <div>
            <p className="text-lg font-semibold text-neutral-900 dark:text-gray-100">BacarNet</p>
            <p className="text-xs text-neutral-500 dark:text-gray-400">Simplificando tu trabajo diario</p>
          </div>
        </Link>

        <nav className="hidden flex-1 items-center gap-1 lg:flex">
          <NavLink to="/intranet" end className={navLinkClass}>
            Inicio
          </NavLink>
          {!externalAccount && permissions.view_links && (
            <NavLink to="/accesos-directos" className={navLinkClass}>
              Accesos directos
            </NavLink>
          )}
          {settings.directoryEnabled && permissions.view_directory && (
            <NavLink to="/directorio" className={navLinkClass}>
              Contactos
            </NavLink>
          )}
          {settings.resourcesEnabled && permissions.view_drive && (
            <NavLink to="/recursos" className={navLinkClass}>
              Archivos
            </NavLink>
          )}
          {canAccessBoards && (
            <NavLink to="/tableros" className={navLinkClass}>
              Tableros
            </NavLink>
          )}
          {canAccessAudit && (
            <NavLink to="/admin/auditoria" className={navLinkClass}>
              Auditoría
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {!externalAccount && settings.notificationsEnabled && <NotificationBell />}

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Activar modo claro' : 'Activar modo oscuro'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:border-zinc-700 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-gray-100"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-zinc-600 transition-colors hover:text-brand-primary dark:text-zinc-400 dark:hover:text-brand-primary md:px-3"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden md:inline">Salir</span>
          </button>

          {canAccessAdmin && (
            <Link to="/admin" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
              Panel admin
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
