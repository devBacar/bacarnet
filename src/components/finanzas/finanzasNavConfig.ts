/**
 * Sub-navegación del módulo Finanzas (/finanzas/*).
 * Agregar futuras secciones acá — no en la navbar principal de BacarNet.
 */
export interface FinanzasNavItem {
  /** Path absoluto bajo /finanzas */
  to: string
  label: string
  /** Si false, no se muestra (fases futuras en desarrollo). */
  enabled?: boolean
}

export const FINANZAS_NAV_ITEMS: FinanzasNavItem[] = [
  { to: '/finanzas/hoy', label: 'Hoy', enabled: true },
  { to: '/finanzas/cuentas', label: 'Saldos', enabled: true },
  { to: '/finanzas/agenda', label: 'Agenda', enabled: true },
  { to: '/finanzas/cajas', label: 'Cajas', enabled: true },
  { to: '/finanzas/transferencias', label: 'Transferencias', enabled: true },
  { to: '/finanzas/movimientos', label: 'Movimientos', enabled: true },
  // Fases futuras — habilitar cuando exista la ruta:
  // { to: '/finanzas/creditos', label: 'Créditos', enabled: false },
]

export const FINANZAS_DEFAULT_PATH = '/finanzas/hoy'
