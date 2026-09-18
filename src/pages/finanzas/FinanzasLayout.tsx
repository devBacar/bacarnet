import { Landmark } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { FinanzasSubNav } from '../../components/finanzas/FinanzasSubNav'

/** Layout compartido de /finanzas/* — sub-navegación interna + contenido de cada sección. */
export function FinanzasLayout() {
  return (
    <div className="layout-container py-8">
      <div className="mb-8 border-b border-neutral-200 pb-6 dark:border-zinc-800">
        <p className="text-brand-primary mb-1 flex items-center gap-2 text-sm font-medium uppercase tracking-wide">
          <Landmark className="h-4 w-4" aria-hidden />
          Finanzas
        </p>
        <FinanzasSubNav />
      </div>
      <Outlet />
    </div>
  )
}
