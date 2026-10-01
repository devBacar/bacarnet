import { Info, Landmark } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import { FinanzasSubNav } from '../../components/finanzas/FinanzasSubNav'
import { ayudaDeRuta } from '../../components/finanzas/finanzasNavConfig'

/** Layout compartido de /finanzas/* — sub-navegación interna + contenido de cada sección. */
export function FinanzasLayout() {
  const { pathname } = useLocation()
  const ayuda = ayudaDeRuta(pathname)

  return (
    <div className="layout-container py-8">
      <div className="mb-8 border-b border-neutral-200 pb-6 dark:border-zinc-800">
        <p className="text-brand-primary mb-1 flex items-center gap-2 text-sm font-medium uppercase tracking-wide">
          <Landmark className="h-4 w-4" aria-hidden />
          Finanzas
        </p>
        <FinanzasSubNav />
        {ayuda ? (
          <p className="mt-3 flex items-start gap-1.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{ayuda}</span>
          </p>
        ) : null}
      </div>
      <Outlet />
    </div>
  )
}
