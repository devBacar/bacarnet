/** Días corridos desde la fecha de confección, inclusive el día +5. */
export const VENTANA_DIAS_RECONCILIACION = 5

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/

export function sumarDiasIso(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map((part) => Number(part))
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** fecha del movimiento >= día de confección y <= ese día + 5. */
export function fechaDentroDeVentana(fechaMovimiento: string, diaConfeccion: string): boolean {
  if (!DIA_ISO.test(fechaMovimiento) || !DIA_ISO.test(diaConfeccion)) return false
  const hasta = sumarDiasIso(diaConfeccion, VENTANA_DIAS_RECONCILIACION)
  return fechaMovimiento >= diaConfeccion && fechaMovimiento <= hasta
}

export type ClasificacionCandidatos = 'ninguno' | 'unico' | 'multiple'

export function clasificarCandidatos(cantidad: number): ClasificacionCandidatos {
  if (cantidad <= 0) return 'ninguno'
  if (cantidad === 1) return 'unico'
  return 'multiple'
}

export function mismosIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const left = [...a].sort()
  const right = [...b].sort()
  return left.every((id, index) => id === right[index])
}
