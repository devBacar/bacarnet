import type { Timestamp } from 'firebase-admin/firestore'
import type {
  HelpdeskAnalisis,
  HelpdeskBitacoraEntrada,
  HelpdeskEmailLog,
  HelpdeskReunion,
  HelpdeskTicket,
} from './types.js'
import type { HelpdeskVistoPorDoc, HelpdeskVistoSeccion } from './vistoPorTypes.js'

function tsMs(value: Timestamp | undefined | null): number | null {
  if (!value || typeof value.toMillis !== 'function') return null
  const ms = value.toMillis()
  return Number.isFinite(ms) ? ms : null
}

function maxMs(values: Array<number | null | undefined>): number | null {
  let best: number | null = null
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue
    if (best === null || v > best) best = v
  }
  return best
}

export function computeSeguimientoActivityMs(ticket: HelpdeskTicket): number | null {
  return maxMs([
    tsMs(ticket.createdAt),
    tsMs(ticket.seguimientoUpdatedAt),
    ticket.cancelado === true ? tsMs(ticket.canceladoFecha) : null,
  ])
}

export function computeAnalisisActivityMs(analisis: (HelpdeskAnalisis & { id: string })[]): number | null {
  const parts: Array<number | null> = []
  for (const row of analisis) {
    parts.push(tsMs(row.subidoFecha))
    if (row.estado === 'aprobado' || row.estado === 'rechazado') {
      parts.push(tsMs(row.decididoFecha))
    }
  }
  return maxMs(parts)
}

export function computeReunionesActivityMs(reuniones: (HelpdeskReunion & { id: string })[]): number | null {
  const parts: Array<number | null> = []
  for (const reunion of reuniones) {
    parts.push(tsMs(reunion.createdAt))
    parts.push(tsMs(reunion.estadoUpdatedAt))
    parts.push(tsMs(reunion.minuta?.updatedAt))
    parts.push(tsMs(reunion.minutaDiagnostico?.updatedAt))
  }
  return maxMs(parts)
}

export function computeBitacoraActivityMs(
  entradas: (HelpdeskBitacoraEntrada & { id: string })[],
): number | null {
  const parts = entradas.map((e) => tsMs(e.createdAt))
  return maxMs(parts)
}

export function computeCorreosActivityMs(emailLog: (HelpdeskEmailLog & { id: string })[]): number | null {
  const parts = emailLog.map((e) => tsMs(e.fecha))
  return maxMs(parts)
}

export type HelpdeskSectionActivityMs = Record<HelpdeskVistoSeccion, number | null>

export function computeAllSectionActivityMs(input: {
  ticket: HelpdeskTicket & { id: string }
  analisis: (HelpdeskAnalisis & { id: string })[]
  reuniones: (HelpdeskReunion & { id: string })[]
  bitacora: (HelpdeskBitacoraEntrada & { id: string })[]
  emailLog: (HelpdeskEmailLog & { id: string })[]
}): HelpdeskSectionActivityMs {
  return {
    seguimiento: computeSeguimientoActivityMs(input.ticket),
    analisis: computeAnalisisActivityMs(input.analisis),
    reuniones: computeReunionesActivityMs(input.reuniones),
    bitacora: computeBitacoraActivityMs(input.bitacora),
    correos: computeCorreosActivityMs(input.emailLog),
  }
}

export function computeNovedadesPorSeccion(
  activity: HelpdeskSectionActivityMs,
  visto: HelpdeskVistoPorDoc | null,
): Record<HelpdeskVistoSeccion, boolean> {
  const out = {} as Record<HelpdeskVistoSeccion, boolean>
  for (const key of Object.keys(activity) as HelpdeskVistoSeccion[]) {
    const activityMs = activity[key]
    if (activityMs === null) {
      out[key] = false
      continue
    }
    const seenMs = tsMs(visto?.[key] ?? null)
    out[key] = seenMs === null || activityMs > seenMs
  }
  return out
}
