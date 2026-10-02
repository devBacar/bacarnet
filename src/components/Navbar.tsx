import { Menu } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context'
import { useGlobalSettings } from '../context/GlobalSettingsContext'
import { useBoardsVisibility } from '../hooks/useBoardsVisibility'
import { DEFAULT_PERMISSIONS, hasFinanzasAccess, isExternalAccount, isSuperAdmin } from '../services/userService'
import { AppHeader } from './AppHeader'
import { MobileNavDrawer } from './MobileNavDrawer'
import { NavAccountActions } from './NavAccountActions'
import { useLogout } from './useLogout'
import { NavMoreMenu } from './NavMoreMenu'
import { buildMainNavItems, type MainNavItem } from './mainNavItems'

function linkLook(active: boolean): string {
  return `items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] xl:px-2 ${
    active
      ? 'nav-link-active'
      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-gray-100'
  }`
}

function MainNavLink({ item, className }: { item: MainNavItem; className: string }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => `${className} ${linkLook(isActive)}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {item.label}
    </NavLink>
  )
}

export function Navbar() {
  const { userProfile } = useAuth()
  const { settings } = useGlobalSettings()
  const logout = useLogout()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), [])
  const permissions = userProfile?.permissions ?? DEFAULT_PERMISSIONS
  const externalAccount = isExternalAccount(userProfile)
  const canAccessAudit = isSuperAdmin(userProfile)
  const boardsVisible = useBoardsVisibility()
  const canAccessBoards = boardsVisible === true

  const items = useMemo(
    () =>
      buildMainNavItems({
        externalAccount,
        viewLinks: permissions.view_links,
        viewDirectory: permissions.view_directory,
        viewDrive: permissions.view_drive,
        directoryEnabled: settings.directoryEnabled,
        resourcesEnabled: settings.resourcesEnabled,
        finanzasEnabled: settings.finanzasEnabled,
        finanzasAccess: hasFinanzasAccess(userProfile),
        canAccessBoards,
        canAccessAudit,
      }),
    [
      canAccessAudit,
      canAccessBoards,
      externalAccount,
      permissions.view_directory,
      permissions.view_drive,
      permissions.view_links,
      settings.directoryEnabled,
      settings.finanzasEnabled,
      settings.resourcesEnabled,
      userProfile,
    ],
  )

  const principal = items.filter((item) => item.group === 'principal')
  const mas = items.filter((item) => item.group === 'mas')
  const ayuda = items.find((item) => item.group === 'ayuda')

  return (
    <AppHeader>
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Abrir menú de navegación"
        title="Abrir menú"
        aria-expanded={mobileNavOpen}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800 lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      <Link to="/intranet" className="flex min-w-0 shrink items-center gap-3">
        <img src="/logo-bacar.png" alt="Logo Bacar" className="h-9 w-9 shrink-0 object-contain" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-neutral-900 dark:text-gray-100">BacarNet</p>
          <p className="hidden truncate text-xs text-neutral-500 xl:block dark:text-gray-400">
            Simplificando tu trabajo diario
          </p>
        </div>
      </Link>

      <nav className="hidden min-w-0 flex-1 items-center gap-0.5 lg:flex xl:gap-1">
        {principal.map((item) => (
          <MainNavLink key={item.to} item={item} className="inline-flex shrink-0" />
        ))}
        {mas.length > 0 && <NavMoreMenu items={mas} menuLabel="Más secciones" />}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        {ayuda && <MainNavLink item={ayuda} className="hidden shrink-0 lg:inline-flex" />}
        <NavAccountActions showAdmin />
      </div>

      <MobileNavDrawer
        open={mobileNavOpen}
        onClose={closeMobileNav}
        items={items}
        onLogout={() => {
          void logout()
        }}
      />
    </AppHeader>
  )
}
