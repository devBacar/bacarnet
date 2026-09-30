import { ExtractoConsultaError } from './extracto.errors.js'

/** Cada consulta al banco entra en este tope. El período entero, en el de abajo. */
export const DIAS_MAX_TRAMO = 60
export const DIAS_MAX_PERIODO = 180

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export function fechaIsoValida(iso: string): boolean {
  if (!ISO_RE.test(iso)) return false
  const [year, month, day] = iso.split('-').map((part) => Number(part))
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map((part) => Number(part))
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Días del rango, contando el primero y el último. */
export function diasInclusivos(desde: string, hasta: string): number {
  const start = Date.parse(`${desde}T00:00:00Z`)
  const end = Date.parse(`${hasta}T00:00:00Z`)
  return Math.round((end - start) / 86_400_000) + 1
}

export function fechaDma(iso: string): string {
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

/**
 * Parte [desde, hasta] en tramos de a lo sumo `maxDias` días (inclusive).
 * El banco no acepta más de 60 días por consulta.
 */
export function partirPeriodoEnTramos(
  desde: string,
  hasta: string,
  maxDias = DIAS_MAX_TRAMO,
): Array<{ desde: string; hasta: string }> {
  if (!fechaIsoValida(desde) || !fechaIsoValida(hasta) || desde > hasta || maxDias < 1) {
    throw new ExtractoConsultaError('El período del extracto no es válido.')
  }
  const tramos: Array<{ desde: string; hasta: string }> = []
  let cursor = desde
  while (cursor <= hasta) {
    const fin = addIsoDays(cursor, maxDias - 1)
    const hastaTramo = fin < hasta ? fin : hasta
    tramos.push({ desde: cursor, hasta: hastaTramo })
    if (hastaTramo >= hasta) break
    cursor = addIsoDays(hastaTramo, 1)
  }
  return tramos
}

/**
 * Ventana del producto: no más de 180 días, y no más atrás que 180 días desde hoy.
 * `hoy` es un día Argentina (YYYY-MM-DD).
 */
export function validarPeriodoExtracto(desde: string, hasta: string, hoy: string): void {
  if (!fechaIsoValida(hoy)) {
    throw new ExtractoConsultaError('No se pudo saber la fecha de hoy.')
  }
  if (!fechaIsoValida(desde)) throw new ExtractoConsultaError('La fecha desde no es válida.')
  if (!fechaIsoValida(hasta)) throw new ExtractoConsultaError('La fecha hasta no es válida.')
  if (desde > hasta) {
    throw new ExtractoConsultaError('La fecha desde tiene que ser anterior o igual a la fecha hasta.')
  }
  if (hasta > hoy) {
    throw new ExtractoConsultaError('La fecha hasta no puede ser posterior a hoy.')
  }
  if (diasInclusivos(desde, hasta) > DIAS_MAX_PERIODO) {
    throw new ExtractoConsultaError('El período no puede pasar de 180 días.')
  }
  const masViejo = addIsoDays(hoy, -DIAS_MAX_PERIODO)
  if (desde < masViejo) {
    throw new ExtractoConsultaError('Solo se puede pedir el extracto de los últimos 180 días.')
  }
}
