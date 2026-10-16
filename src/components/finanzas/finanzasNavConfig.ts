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
  /** Una línea, en palabras, de para qué sirve la pantalla. */
  ayuda?: string
}

export const FINANZAS_NAV_ITEMS: FinanzasNavItem[] = [
  {
    to: '/finanzas/hoy',
    label: 'Hoy',
    enabled: true,
    ayuda: 'Lo de hoy y esta semana: qué pagar, qué cobrar y avisos.',
  },
  {
    to: '/finanzas/cuentas',
    label: 'Saldos',
    enabled: true,
    ayuda: 'Cuánto hay en cada banco y cuánto descubierto queda.',
  },
  {
    to: '/finanzas/agenda',
    label: 'Agenda',
    enabled: true,
    ayuda: 'Todo lo que hay que pagar y cobrar, y los pagos ya hechos con su medio.',
  },
  {
    to: '/finanzas/cajas',
    label: 'Cajas',
    enabled: true,
    ayuda: 'El efectivo. Acá queda cada pago y cobro en efectivo.',
  },
  {
    to: '/finanzas/transferencias',
    label: 'Transferencias',
    enabled: true,
    ayuda: 'Las transferencias armadas: esperando firma, hechas o rechazadas.',
  },
  {
    to: '/finanzas/movimientos',
    label: 'Movimientos',
    enabled: true,
    ayuda: 'Cada débito y crédito que manda el banco.',
  },
  {
    to: '/finanzas/extractos',
    label: 'Extractos',
    enabled: true,
    ayuda: 'Para descargar el resumen del banco.',
  },
  {
    to: '/finanzas/cheques',
    label: 'Cheques',
    enabled: true,
    ayuda: 'La cartera, los cheques emitidos y los endosados. Acá queda el cheque que usaste para pagar.',
  },
  {
    to: '/finanzas/vientri',
    label: 'Vientri',
    enabled: true,
    ayuda: 'Lo que se cargó en Vientri: cheques y facturas pendientes. Solo para ver; se corrige en Vientri.',
  },
  // Fases futuras — habilitar cuando exista la ruta:
  // { to: '/finanzas/creditos', label: 'Créditos', enabled: false },
]

export function ayudaDeRuta(pathname: string): string | null {
  const normal = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  const item = FINANZAS_NAV_ITEMS.find(
    (entrada) =>
      entrada.enabled !== false &&
      entrada.ayuda &&
      (normal === entrada.to || normal.startsWith(`${entrada.to}/`)),
  )
  return item?.ayuda ?? null
}

export const FINANZAS_DEFAULT_PATH = '/finanzas/hoy'
