import { ArrowLeft, Landmark, Menu } from 'lucide-react'
import { BotonAyuda } from './recorrido/BotonAyuda'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { AppHeader } from '../AppHeader'
import { MobileNavDrawer, type MobileNavItem } from '../MobileNavDrawer'
import { NavAccountActions } from '../NavAccountActions'
import { MoreMenuLabel, NavMoreMenu } from '../NavMoreMenu'
import { isNavItemActive, moreTriggerClass } from '../navMenuShared'
import { useLogout } from '../useLogout'
import { useFinanzasNavItems } from './FinanzasSubNav'

function countThatFit(widths: number[], available: number, gap: number, moreWidth: number): number {
  const total = widths.reduce((sum, width, index) => sum + width + (index > 0 ? gap : 0), 0)
  if (total <= available + 1) return widths.length

  let used = 0
  let count = 0
  for (let index = 0; index < widths.length; index += 1) {
    const next = used + (count > 0 ? gap : 0) + widths[index]
    if (next + gap + moreWidth > available + 1) break
    used = next
    count += 1
  }
  return count
}

function tabClass(active: boolean): string {
  return `inline-flex shrink-0 items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? 'bg-brand-primary text-white'
      : 'text-body-muted hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-zinc-800 dark:hover:text-gray-100'
  }`
}

export function FinanzasNavbar() {
  const { pathname } = useLocation()
  const logout = useLogout()
  const sections = useFinanzasNavItems()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), [])
  const containerRef = useRef<HTMLElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(sections.length)

  const drawerItems = useMemo<MobileNavItem[]>(
    () => [
      { to: '/intranet', end: true, label: 'Volver a Inicio', icon: ArrowLeft },
      ...sections.map((item, index) => ({
        to: item.to,
        end: true,
        label: item.label,
        dividerBefore: index === 0,
      })),
    ],
    [sections],
  )

  useLayoutEffect(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) return

    const measureNow = () => {
      const available = container.clientWidth
      if (available <= 0) return

      const gap = Number.parseFloat(getComputedStyle(measure).columnGap) || 0
      const widths = Array.from(measure.querySelectorAll<HTMLElement>('[data-fit="tab"]')).map(
        (node) => node.offsetWidth,
      )
      if (widths.length === 0 || widths.every((width) => width === 0)) return
      const plainMore = measure.querySelector<HTMLElement>('[data-fit="more"]')?.offsetWidth ?? 0
      let count = countThatFit(widths, available, gap, plainMore)
      const activeIndex = sections.findIndex((item) => isNavItemActive(pathname, item.to, true))
      if (activeIndex >= count && sections[activeIndex]) {
        const activeTo = sections[activeIndex].to
        const activeMore =
          Array.from(measure.querySelectorAll<HTMLElement>('[data-fit="more-active"]')).find(
            (node) => node.dataset.to === activeTo,
          )?.offsetWidth ?? plainMore
        count = countThatFit(widths, available, gap, activeMore)
      }
      setVisibleCount(count)
    }

    measureNow()
    const observer = new ResizeObserver(measureNow)
    observer.observe(container)
    let cancelled = false
    void document.fonts?.ready.then(() => {
      if (!cancelled) measureNow()
    })
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [pathname, sections])

  const visible = sections.slice(0, visibleCount)
  const overflow = sections.slice(visibleCount)

  return (
    <AppHeader>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 md:flex-none md:shrink-0">
        <Link
          to="/intranet"
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 sm:px-2 dark:text-gray-300 dark:hover:bg-zinc-800 dark:hover:text-gray-100"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Inicio
        </Link>
        <span className="h-6 w-px shrink-0 bg-neutral-200 dark:bg-zinc-700" aria-hidden />
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-brand-primary">
          <Landmark className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">Finanzas</span>
        </p>
      </div>

      <nav
        ref={containerRef}
        aria-label="Secciones de Finanzas"
        className="relative hidden min-w-0 flex-1 items-center gap-1 md:flex"
      >
        <div className="pointer-events-none fixed top-0 left-0 h-0 w-0 overflow-hidden" aria-hidden>
          <div ref={measureRef} className="flex w-max items-center gap-1">
            {sections.map((item) => (
              <span key={item.to} data-fit="tab" className={tabClass(false)}>
                {item.label}
              </span>
            ))}
            <button type="button" tabIndex={-1} data-fit="more" className={moreTriggerClass(false, 'tab')}>
              <MoreMenuLabel text="Más" />
            </button>
            {sections.map((item) => (
              <button
                key={`mas-${item.to}`}
                type="button"
                tabIndex={-1}
                data-fit="more-active"
                data-to={item.to}
                className={moreTriggerClass(true, 'tab')}
              >
                <MoreMenuLabel text={`Más · ${item.label}`} />
              </button>
            ))}
          </div>
        </div>

        {visible.map((item) => (
          <NavLink key={item.to} to={item.to} end className={({ isActive }) => tabClass(isActive)}>
            {item.label}
          </NavLink>
        ))}
        {overflow.length > 0 && (
          <NavMoreMenu
            tone="tab"
            menuLabel="Más secciones de Finanzas"
            items={overflow.map((item) => ({ to: item.to, end: true, label: item.label }))}
          />
        )}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Abrir secciones de Finanzas"
          title="Abrir secciones de Finanzas"
          aria-expanded={mobileNavOpen}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800 md:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <BotonAyuda variante="barra" />
        <NavAccountActions />
      </div>

      <MobileNavDrawer
        open={mobileNavOpen}
        onClose={closeMobileNav}
        items={drawerItems}
        onLogout={() => {
          void logout()
        }}
        eyebrow="Finanzas"
        title="Secciones"
        ariaLabel="Secciones de Finanzas"
        hideFrom="md"
        extra={<BotonAyuda variante="menu" alAbrir={closeMobileNav} />}
      />
    </AppHeader>
  )
}
