import { LogOut, X, type LucideIcon } from 'lucide-react'
import { Fragment, useEffect } from 'react'
import { NavLink } from 'react-router-dom'

export interface MobileNavItem {
  to: string
  end?: boolean
  label: string
  icon?: LucideIcon
  group?: 'principal' | 'mas' | 'ayuda'
  dividerBefore?: boolean
}

interface MobileNavDrawerProps {
  open: boolean
  onClose: () => void
  items: MobileNavItem[]
  onLogout: () => void
  eyebrow?: string
  title?: string
  ariaLabel?: string
  /** A partir de este ancho el panel se cierra y se oculta. */
  hideFrom?: 'md' | 'lg'
}

const drawerLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center gap-3 rounded-lg px-4 py-2.5 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
    isActive
      ? 'bg-brand-primary text-white'
      : 'text-neutral-700 hover:bg-neutral-100 dark:text-gray-200 dark:hover:bg-zinc-800'
  }`

export function MobileNavDrawer({
  open,
  onClose,
  items,
  onLogout,
  eyebrow = 'BacarNet',
  title = 'Navegación',
  ariaLabel = 'Menú de navegación',
  hideFrom = 'lg',
}: MobileNavDrawerProps) {
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    const media = window.matchMedia(hideFrom === 'md' ? '(min-width: 768px)' : '(min-width: 1024px)')
    const onMedia = () => {
      if (media.matches) onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    media.addEventListener('change', onMedia)
    return () => {
      document.documentElement.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      media.removeEventListener('change', onMedia)
    }
  }, [open, onClose, hideFrom])

  if (!open) return null

  const hiddenFrom = hideFrom === 'md' ? 'md:hidden' : 'lg:hidden'

  return (
    <div className={`fixed inset-0 z-[60] ${hiddenFrom}`} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <button
        type="button"
        aria-label="Cerrar menú"
        className="absolute inset-0 bg-neutral-900/40"
        onClick={onClose}
      />

      <aside className="app-drawer-aside absolute inset-y-0 left-0 max-w-[min(100%,20rem)] shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-4 dark:border-zinc-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-primary">{eyebrow}</p>
            <p className="text-sm font-medium text-neutral-900 dark:text-gray-100">{title}</p>
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
          {items.map((item, index) => {
            const Icon = item.icon
            const showMas = item.group === 'mas' && items[index - 1]?.group !== 'mas'
            return (
              <Fragment key={item.to}>
                {item.dividerBefore ? (
                  <div className="mx-3 my-1 h-px bg-neutral-200 dark:bg-zinc-700" role="separator" />
                ) : null}
                {showMas ? (
                  <p className="px-4 pb-1 pt-3 text-xs font-semibold text-neutral-400 dark:text-zinc-500">Más</p>
                ) : null}
                <NavLink to={item.to} end={item.end} className={drawerLinkClass} onClick={onClose}>
                  {Icon ? <Icon className="h-5 w-5 shrink-0" aria-hidden /> : null}
                  {item.label}
                </NavLink>
              </Fragment>
            )
          })}
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
