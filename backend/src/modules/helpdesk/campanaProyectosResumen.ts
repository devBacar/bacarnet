import { listHelpdeskTickets } from './repository.js'
import { HELPDESK_TICKET_ESTADOS, type HelpdeskTicket } from './types.js'

const FINAL_ESTADO_IDX = HELPDESK_TICKET_ESTADOS.length - 1

function normalizeAreaKey(name: string | null | undefined): string {
  if (typeof name !== 'string') return ''
  return name.trim().toLowerCase()
}

function isTestTicket(ticket: HelpdeskTicket & { id: string }): boolean {
  const p = (ticket.problematica ?? '').toLowerCase()
  const area = (ticket.areaNombre ?? '').toLowerCase()
  const email = (ticket.requesterEmail ?? '').toLowerCase()
  const nombre = (ticket.requesterNombre ?? '').toLowerCase()
  if (p.includes('[e2e') || p.includes('e2e prod') || p.includes('e2e —')) return true
  if (area.includes('e2e')) return true
  if (email.includes('prueba.helpdesk') || email.includes('+e2e')) return true
  if (nombre.startsWith('e2e ')) return true
  if (ticket.token === 'e2e-notif-analisis' || ticket.token === 'prod-screenshot-seed') return true
  return false
}

export function isHelpdeskTicketActivo(ticket: HelpdeskTicket): boolean {
  if (ticket.cancelado === true) return false
  if (typeof ticket.estadoIdx !== 'number') return true
  return ticket.estadoIdx !== FINAL_ESTADO_IDX
}

export type ProyectosPorAreaResumen = {
  areaNombre: string
  activos: number
  urgenciaAlta: number
  porEstado: Array<{ estadoIdx: number; label: string; count: number }>
}

export type ProyectosResumenGeneral = {
  totalActivos: number
  urgenciaAlta: number
}

export type CampanaProyectosSnapshot = {
  porArea: ProyectosPorAreaResumen[]
  general: ProyectosResumenGeneral
}

function buildPorEstadoCounts(tickets: HelpdeskTicket[]): ProyectosPorAreaResumen['porEstado'] {
  const counts = new Array<number>(HELPDESK_TICKET_ESTADOS.length).fill(0)
  for (const ticket of tickets) {
    const idx =
      typeof ticket.estadoIdx === 'number' &&
      ticket.estadoIdx >= 0 &&
      ticket.estadoIdx < HELPDESK_TICKET_ESTADOS.length
        ? ticket.estadoIdx
        : 0
    counts[idx] += 1
  }
  return HELPDESK_TICKET_ESTADOS.map((label, idx) => ({
    estadoIdx: idx,
    label,
    count: counts[idx] ?? 0,
  }))
}

/** Proyectos activos agrupados por areaNombre (helpdeskTickets). */
export async function loadCampanaProyectosSnapshot(
  areaNamesHint: string[] = [],
): Promise<CampanaProyectosSnapshot> {
  const all = await listHelpdeskTickets()
  const activos = all.filter((t) => !isTestTicket(t) && isHelpdeskTicketActivo(t))

  const byAreaKey = new Map<string, { displayName: string; tickets: HelpdeskTicket[] }>()

  for (const ticket of activos) {
    const display = (ticket.areaNombre ?? '').trim() || 'Sin área'
    const key = normalizeAreaKey(display)
    const bucket = byAreaKey.get(key) ?? { displayName: display, tickets: [] }
    bucket.tickets.push(ticket)
    byAreaKey.set(key, bucket)
  }

  for (const hint of areaNamesHint) {
    const trimmed = hint.trim()
    if (!trimmed) continue
    const key = normalizeAreaKey(trimmed)
    if (!byAreaKey.has(key)) {
      byAreaKey.set(key, { displayName: trimmed, tickets: [] })
    }
  }

  const porArea: ProyectosPorAreaResumen[] = [...byAreaKey.values()]
    .map(({ displayName, tickets }) => ({
      areaNombre: displayName,
      activos: tickets.length,
      urgenciaAlta: tickets.filter((t) => t.urgencia === 'alta').length,
      porEstado: buildPorEstadoCounts(tickets),
    }))
    .sort((a, b) => a.areaNombre.localeCompare(b.areaNombre, 'es'))

  return {
    porArea,
    general: {
      totalActivos: activos.length,
      urgenciaAlta: activos.filter((t) => t.urgencia === 'alta').length,
    },
  }
}
