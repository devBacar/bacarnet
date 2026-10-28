import type { ReactNode } from 'react'

/** Barra superior: mismo alto y fondo que el menú general. */
export function AppHeader({ children }: { children: ReactNode }) {
  return (
    <header
      className="shrink-0 border-b"
      style={{
        backgroundColor: 'var(--color-navbar-bg)',
        borderColor: 'var(--color-navbar-border)',
      }}
    >
      <div className="layout-container flex items-center gap-1.5 !py-3 sm:gap-3">{children}</div>
    </header>
  )
}
