import { Outlet, useLocation } from 'react-router-dom'
import { FinanzasNavbar } from './finanzas/FinanzasNavbar'
import { Navbar } from './Navbar'

export function PublicLayout() {
  const { pathname } = useLocation()
  const modoFinanzas = pathname === '/finanzas' || pathname.startsWith('/finanzas/')

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white text-brand-body dark:bg-zinc-950">
      {modoFinanzas ? <FinanzasNavbar /> : <Navbar />}
      <main
        className={
          modoFinanzas
            ? 'flex-1 overflow-y-auto scrollbar-overlay'
            : 'layout-container flex-1 overflow-y-auto scrollbar-overlay'
        }
      >
        <Outlet />
      </main>
    </div>
  )
}
