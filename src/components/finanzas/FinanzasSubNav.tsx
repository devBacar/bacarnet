import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context'
import { hasFinanzasAccess } from '../../services/userService'
import { FINANZAS_NAV_ITEMS } from './finanzasNavConfig'

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-brand-primary text-white'
      : 'text-body-muted hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-zinc-800 dark:hover:text-gray-100'
  }`

export function FinanzasSubNav() {
  const { userProfile } = useAuth()
  const finanzasCompleto = hasFinanzasAccess(userProfile)
  const items = FINANZAS_NAV_ITEMS.filter((item) => item.enabled !== false).filter(
    (item) => finanzasCompleto || item.to.includes('/finanzas/cajas'),
  )

  return (
    <nav
      aria-label="Secciones de Finanzas"
      className="mt-4 inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-neutral-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} className={tabClass} end>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
