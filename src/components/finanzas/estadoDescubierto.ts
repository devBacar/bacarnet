/**
 * Estado del descubierto de un banco: la misma etiqueta y color en Saldos y en Hoy.
 * Funciones puras: sin React, sin fetch. Todo en centavos de pesos.
 */

export type TonoEstado = 'verde' | 'ambar' | 'rojo' | 'gris'

export type ClaveEstadoDescubierto =
  | 'a_favor'
  | 'con_margen'
  | 'queda_poco'
  | 'al_limite'
  | 'pasado'
  | 'sin_descubierto'

export interface EstadoDescubierto {
  clave: ClaveEstadoDescubierto
  /** Texto de la etiqueta: A favor, Con margen, Queda poco, Al límite, Pasado, Sin descubierto. */
  etiqueta: string
  tono: TonoEstado
  /** Descubierto acordado que vale (positivo) o null si no hay uno cargado. */
  descubiertoCentavos: number | null
  /** Saldo más descubierto: lo que queda para usar. Negativo si está pasado; null sin descubierto. */
  leQuedaCentavos: number | null
  /** Cuánto se pasó del descubierto; 0 si no se pasó. */
  excesoCentavos: number
}

const LIMITE_VERDE = 60
const LIMITE_AMBAR = 90

function descubiertoQueVale(descubiertoCentavos: number | null | undefined): number | null {
  return descubiertoCentavos != null && descubiertoCentavos > 0 ? descubiertoCentavos : null
}

export function estadoDescubierto(
  saldoCentavos: number,
  descubiertoCentavos: number | null | undefined,
): EstadoDescubierto {
  const descubierto = descubiertoQueVale(descubiertoCentavos)
  const leQuedaCentavos = descubierto == null ? null : saldoCentavos + descubierto
  const excesoCentavos = leQuedaCentavos != null && leQuedaCentavos < 0 ? -leQuedaCentavos : 0
  const comun = { descubiertoCentavos: descubierto, leQuedaCentavos, excesoCentavos }

  if (saldoCentavos >= 0) {
    return { clave: 'a_favor', etiqueta: 'A favor', tono: 'verde', ...comun }
  }
  if (descubierto == null) {
    return { clave: 'sin_descubierto', etiqueta: 'Sin descubierto', tono: 'gris', ...comun }
  }
  if (excesoCentavos > 0) {
    return { clave: 'pasado', etiqueta: 'Pasado', tono: 'rojo', ...comun }
  }
  const porcentajeUso = (-saldoCentavos / descubierto) * 100
  if (porcentajeUso > LIMITE_AMBAR) {
    return { clave: 'al_limite', etiqueta: 'Al límite', tono: 'rojo', ...comun }
  }
  if (porcentajeUso > LIMITE_VERDE) {
    return { clave: 'queda_poco', etiqueta: 'Queda poco', tono: 'ambar', ...comun }
  }
  return { clave: 'con_margen', etiqueta: 'Con margen', tono: 'verde', ...comun }
}

/** Clases de la etiqueta chica de estado, por tono. */
export const ETIQUETA_ESTADO_CLASES: Record<TonoEstado, string> = {
  verde: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  ambar: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  rojo: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  gris: 'bg-neutral-100 text-neutral-600 dark:bg-zinc-800 dark:text-gray-300',
}
