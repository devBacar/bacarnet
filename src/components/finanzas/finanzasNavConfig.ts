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
  { to: '/finanzas/cuentas', label: 'Saldos', enabled: true },
  { to: '/finanzas/cheques', label: 'Cheques', enabled: true },
  { to: '/finanzas/agenda', label: 'Agenda', enabled: true },
  // Fases futuras — habilitar cuando exista la ruta:
  // { to: '/finanzas/creditos', label: 'Créditos', enabled: false },
  // { to: '/finanzas/caja-chica', label: 'Caja chica', enabled: false },
  // { to: '/finanzas/transferencias', label: 'Transferencias', enabled: false },
]

export const FINANZAS_DEFAULT_PATH = '/finanzas/cuentas'
