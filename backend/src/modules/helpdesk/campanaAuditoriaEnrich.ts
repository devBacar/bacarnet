import type { CampanaAuditoriaRow } from './getCampanaAuditoria.js'

export interface CampanaTicketRef {
  ticketId: string
  createdAtIso: string
  areaNombre: string
}

export interface CampanaAuditoriaEnrichedRow extends CampanaAuditoriaRow {
  /** Respuesta al hilo del mail de difusión (Gmail / n8n). */
  respondio_correo: boolean | null
  /** Completó el formulario del enlace personalizado (Firestore o marca n8n). */
  respondio_formulario: boolean | null
  fecha_formulario: string | null
  ticket_id: string | null
  /** Mail o formulario: cuenta como respuesta efectiva de campaña. */
  campana_cumplida: boolean | null
  /** Valor crudo en tabla n8n (puede desincronizarse). */
  respondido_tabla_n8n: boolean | null
}

export function normalizeCampanaEmail(email: string | null | undefined): string | null {
  if (typeof email !== 'string') return null
  const trimmed = email.trim().toLowerCase()
  return trimmed || null
}

/** Ticket de solicitud asociado al contacto de campaña (posterior al envío del mail). */
export function pickCampanaTicketForRow(
  tickets: CampanaTicketRef[],
  fechaEnvio: string | null,
): CampanaTicketRef | null {
  if (tickets.length === 0) return null
  const sorted = [...tickets].sort(
    (a, b) => new Date(a.createdAtIso).getTime() - new Date(b.createdAtIso).getTime(),
  )
  const envioMs = fechaEnvio ? new Date(fechaEnvio).getTime() : NaN
  const envioValid = Number.isFinite(envioMs)

  for (const ticket of sorted) {
    const ticketMs = new Date(ticket.createdAtIso).getTime()
    if (!Number.isFinite(ticketMs)) continue
    if (!envioValid) return ticket
    // Tolerancia de reloj: hasta 2 min antes del timestamp de envío.
    if (ticketMs >= envioMs - 2 * 60_000) return ticket
  }
  return null
}

export function enrichCampanaAuditoriaRow(
  row: CampanaAuditoriaRow & { respuesta_manual_detectada?: boolean | null },
  ticketsForEmail: CampanaTicketRef[],
): CampanaAuditoriaEnrichedRow {
  const respondio_correo = row.respuesta_manual_detectada === true
  const ticket = pickCampanaTicketForRow(ticketsForEmail, row.fecha_envio)
  const formFromTicket = ticket != null
  const formFromN8n = row.respondido === true
  const respondio_formulario = formFromTicket || formFromN8n
  const fecha_formulario =
    ticket?.createdAtIso ?? (formFromN8n ? row.fecha_respuesta : null)
  const campana_cumplida = respondio_correo || respondio_formulario

  return {
    ...row,
    respondio_correo,
    respondio_formulario,
    fecha_formulario,
    ticket_id: ticket?.ticketId ?? null,
    campana_cumplida,
    respondido_tabla_n8n: row.respondido,
  }
}
