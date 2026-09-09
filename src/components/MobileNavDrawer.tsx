import { Home, LogOut, X } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'

export interface MobileNavItem {
  to: string
  end?: boolean
  label: string
  icon: typeof Home
}

interface MobileNavDrawerProps {
  open: boolean
  onClose: () => void
  items: MobileNavItem[]
  onLogout: () => void
}

const drawerLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center gap-3 rounded-lg px-4 py-2.5 text-base font-medium transition-colors ${
    isActive
      ? 'bg-brand-primary text-white'
      : 'text-neutral-700 hover:bg-neutral-100 dark:text-gray-200 dark:hover:bg-zinc-800'
  }`

export function MobileNavDrawer({ open, onClose, items, onLogout }: MobileNavDrawerProps) {
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.documentElement.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Menú de navegación">
      <button
        type="button"
        aria-label="Cerrar menú"
        className="absolute inset-0 bg-neutral-900/40"
        onClick={onClose}
      />

      <aside className="app-drawer-aside absolute inset-y-0 left-0 max-w-[min(100%,20rem)] shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-4 dark:border-zinc-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-primary">BacarNet</p>
            <p className="text-sm font-medium text-neutral-900 dark:text-gray-100">Navegación</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <nav className="app-drawer-scroll flex flex-col gap-1 p-3">
          {items.map(({ to, end, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={end} className={drawerLinkClass} onClick={onClose}>
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="app-drawer-footer p-3">
          <button
            type="button"
            onClick={() => {
              onClose()
              onLogout()
            }}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </div>
  )
}
