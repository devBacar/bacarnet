import { Outlet, useLocation } from 'react-router-dom'
import { FinanzasNavbar } from './finanzas/FinanzasNavbar'
import { Navbar } from './Navbar'

export function PublicLayout() {
  const { pathname } = useLocation()
  const modoFinanzas = pathname === '/finanzas' || pathname.startsWith('/finanzas/')

  return (
    <div className="min-h-screen bg-white text-brand-body dark:bg-zinc-950">
      {modoFinanzas ? <FinanzasNavbar /> : <Navbar />}
      <main className={modoFinanzas ? undefined : 'layout-container'}>
        <Outlet />
      </main>
    </div>
  )
}
