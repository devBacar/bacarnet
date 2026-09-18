import type { VencimientoAlerta } from './agenda.types.js'

/** Fecha calendario en Argentina (YYYY-MM-DD). */
export function dateKeyInArgentina(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Alertas de vencimiento (distintas del semáforo de descubierto).
 * - vencido: fecha de vencimiento ya pasó y sigue pendiente/esperado
 * - proximo: vence hoy o mañana
 * - neutro: resto
 */
export function computeVencimientoAlerta(input: {
  fechaVencimiento: Date
  estadoPendiente: boolean
  hoy?: Date
}): VencimientoAlerta {
  if (!input.estadoPendiente) return 'neutro'

  const hoy = input.hoy ?? new Date()
  const venc = dateKeyInArgentina(input.fechaVencimiento)
  const keyHoy = dateKeyInArgentina(hoy)

  const manana = new Date(hoy)
  manana.setDate(manana.getDate() + 1)
  const keyManana = dateKeyInArgentina(manana)

  if (venc < keyHoy) return 'vencido'
  if (venc === keyHoy || venc === keyManana) return 'proximo'
  return 'neutro'
}
