import { Info } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import { ayudaDeRuta } from '../../components/finanzas/finanzasNavConfig'
import { RecorridoProvider } from '../../components/finanzas/recorrido/RecorridoProvider'

/** Layout de /finanzas/*. La barra de secciones está en el encabezado. */
export function FinanzasLayout() {
  const { pathname } = useLocation()
  const ayuda = ayudaDeRuta(pathname)

  return (
    <RecorridoProvider>
      <div className="layout-container !py-4">
        {ayuda ? (
          <p className="mb-3 flex items-start gap-1.5 text-[13px] text-neutral-500 dark:text-neutral-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{ayuda}</span>
          </p>
        ) : null}
        <Outlet />
      </div>
    </RecorridoProvider>
  )
}
