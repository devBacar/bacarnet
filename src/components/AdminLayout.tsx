import { Menu } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function AdminLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), [])

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-zinc-950 lg:flex-row">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Abrir menú del panel admin"
          aria-expanded={mobileNavOpen}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900 dark:text-gray-100">Panel Admin</p>
          <p className="truncate text-xs text-neutral-500 dark:text-gray-400">Administración BacarNet</p>
        </div>
      </header>

      <Sidebar mobileOpen={mobileNavOpen} onMobileClose={closeMobileNav} />

      <main className="min-w-0 flex-1 overflow-auto px-4 py-6 dark:bg-zinc-950 sm:px-6 lg:px-10 lg:py-8 xl:px-12">
        <Outlet />
      </main>
    </div>
  )
}
