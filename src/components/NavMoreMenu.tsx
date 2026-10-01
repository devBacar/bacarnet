import { ChevronDown, MoreHorizontal, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { isNavItemActive, moreTriggerClass } from './navMenuShared'

export interface NavMoreItem {
  to: string
  end?: boolean
  label: string
  icon?: LucideIcon
}

export function MoreMenuLabel({ text, open = false }: { text: string; open?: boolean }) {
  return (
    <>
      <MoreHorizontal className="h-4 w-4 shrink-0" aria-hidden />
      <span>{text}</span>
      <ChevronDown
        className={`h-3.5 w-3.5 shrink-0 opacity-80 transition-transform ${open ? 'rotate-180' : ''}`}
        aria-hidden
      />
    </>
  )
}

export function NavMoreMenu({
  items,
  tone = 'nav',
  menuLabel = 'Más opciones',
}: {
  items: NavMoreItem[]
  tone?: 'nav' | 'tab'
  menuLabel?: string
}) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const activeItem = items.find((item) => isNavItemActive(pathname, item.to, item.end))
  const buttonText = activeItem ? `Más · ${activeItem.label}` : 'Más'

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return

    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
    first?.focus()

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const entries = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    )
    if (entries.length === 0) return
    const current = entries.indexOf(document.activeElement as HTMLElement)

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const next = current < 0 ? 0 : (current + 1) % entries.length
      entries[next]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      const next = current < 0 ? entries.length - 1 : (current - 1 + entries.length) % entries.length
      entries[next]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      entries[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      entries[entries.length - 1]?.focus()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  if (items.length === 0) return null

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        className={moreTriggerClass(Boolean(activeItem), tone)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreMenuLabel text={buttonText} open={open} />
      </button>

      {open && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Cerrar menú"
            className="app-dropdown-backdrop"
            onClick={() => setOpen(false)}
          />
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-label={menuLabel}
            onKeyDown={onMenuKeyDown}
            className="app-dropdown-menu absolute left-0 top-full z-[60] mt-1 min-w-[13rem] overflow-hidden"
          >
            {items.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                      isActive
                        ? 'bg-brand-primary font-medium text-white'
                        : 'text-neutral-700 hover:bg-neutral-50 focus:bg-neutral-50 dark:text-gray-200 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800'
                    }`
                  }
                >
                  {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
                  {item.label}
                </NavLink>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
