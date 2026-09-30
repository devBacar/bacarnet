/**
 * Estados de GET /transfers/details (Información Financiera v1.3.0)
 * y el rótulo que ve Finanzas. Una sola tabla: la usan el sync y el listado.
 */

export type TonoEstadoInterbanking = 'pendiente' | 'enviada' | 'hecha' | 'rechazada'

export interface PresentacionEstadoInterbanking {
  rotulo: string
  tono: TonoEstadoInterbanking
  /** No hace falta volver a consultar este estado. */
  final: boolean
}

interface FilaEstadoInterbanking {
  rotulo: string
  tono: TonoEstadoInterbanking
  final: boolean
  /** El spec trata «Enviada banco crédito» como hecha desde las 19 hs del día de solicitud. */
  hechaDespuesDe19?: boolean
}

export const ESTADOS_INTERBANKING: Readonly<Record<string, FilaEstadoInterbanking>> = {
  confeccionada: { rotulo: 'Falta firmar', tono: 'pendiente', final: false },
  'en autorizacion': {
    rotulo: 'Firmada en parte: falta otra firma',
    tono: 'pendiente',
    final: false,
  },
  autorizada: { rotulo: 'Firmada: falta enviar', tono: 'pendiente', final: false },
  'enviada banco debito': { rotulo: 'Enviada al banco', tono: 'enviada', final: false },
  'enviada banco credito': {
    rotulo: 'Enviada al banco',
    tono: 'enviada',
    final: false,
    hechaDespuesDe19: true,
  },
  'recibida por la red': { rotulo: 'Programada para su fecha', tono: 'pendiente', final: false },
  ejecutada: { rotulo: 'Hecha', tono: 'hecha', final: true },
  'rechazada banco debito': { rotulo: 'Rechazada por el banco', tono: 'rechazada', final: true },
  'rechazada banco credito': { rotulo: 'Rechazada por el banco', tono: 'rechazada', final: true },
  'rechazada por la red': { rotulo: 'Rechazada por el banco', tono: 'rechazada', final: true },
  anulada: { rotulo: 'Anulada', tono: 'pendiente', final: true },
}

const HORA_CIERRE_ARGENTINA = 19

export function claveEstadoInterbanking(estado: string): string {
  return estado
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/** `true` si `now` ya pasó las 19:00 de Argentina del día `fechaSolicitud` (AAAA-MM-DD). */
export function pasoCierreDelDiaSolicitud(fechaSolicitud: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaSolicitud)) return false
  const cierre = Date.parse(`${fechaSolicitud}T${String(HORA_CIERRE_ARGENTINA).padStart(2, '0')}:00:00-03:00`)
  if (!Number.isFinite(cierre)) return false
  return now.getTime() >= cierre
}

export function presentarEstadoInterbanking(input: {
  estado: string | null | undefined
  fechaSolicitud?: string | null
  now?: Date
}): PresentacionEstadoInterbanking | null {
  const crudo = input.estado?.trim() ?? ''
  if (!crudo) return null
  const fila = ESTADOS_INTERBANKING[claveEstadoInterbanking(crudo)]
  if (!fila) {
    return { rotulo: crudo, tono: 'pendiente', final: false }
  }
  if (fila.hechaDespuesDe19 && input.fechaSolicitud && pasoCierreDelDiaSolicitud(input.fechaSolicitud, input.now ?? new Date())) {
    return { rotulo: 'Hecha', tono: 'hecha', final: true }
  }
  return { rotulo: fila.rotulo, tono: fila.tono, final: fila.final }
}

export function esEstadoInterbankingFinal(input: {
  estado: string | null | undefined
  fechaSolicitud?: string | null
  now?: Date
}): boolean {
  return presentarEstadoInterbanking(input)?.final === true
}
