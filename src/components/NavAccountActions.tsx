import { LogOut, Moon, Shield, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth, useTheme } from '../context'
import { useGlobalSettings } from '../context/GlobalSettingsContext'
import { isExternalAccount, isSuperAdmin } from '../services/userService'
import { NotificationBell } from './NotificationBell'
import { useLogout } from './useLogout'

/** Campanita, modo oscuro, cerrar sesión y, si corresponde, administración. */
export function NavAccountActions({ showAdmin = false }: { showAdmin?: boolean }) {
  const logout = useLogout()
  const { userProfile } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const { settings } = useGlobalSettings()
  const externalAccount = isExternalAccount(userProfile)
  const themeLabel = isDark ? 'Activar modo claro' : 'Activar modo oscuro'

  return (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      {!externalAccount && settings.notificationsEnabled && <NotificationBell />}

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={themeLabel}
        title={themeLabel}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:border-zinc-700 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-gray-100"
      >
        {isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
      </button>

      <button
        type="button"
        onClick={() => {
          void logout()
        }}
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        className="hidden h-11 w-11 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-neutral-100 hover:text-brand-primary dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-brand-primary md:inline-flex"
      >
        <LogOut className="h-4 w-4" aria-hidden />
      </button>

      {showAdmin && isSuperAdmin(userProfile) && (
        <Link
          to="/admin"
          aria-label="Administración"
          title="Administración"
          className="btn-primary hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg sm:inline-flex"
        >
          <Shield className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  )
}
