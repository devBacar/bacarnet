import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import {
  getHelpdeskTeamMemberById,
  getHelpdeskTicketById,
  listHelpdeskEmailLogForTicket,
  listHelpdeskNotasForTicket,
  listHelpdeskReunionesForTicket,
} from './repository.js'
import { serializeHelpdeskNota, serializeHelpdeskTicket } from './serializeTicket.js'

export async function getTicketDetailHandler(req: Request, res: Response): Promise<void> {
  const ticketId = String(req.params.ticketId ?? '').trim()
  if (!ticketId) {
    res.status(400).json({ error: 'ticketId inválido' })
    return
  }

  try {
    const ticket = await getHelpdeskTicketById(ticketId)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    const [reuniones, notas, emailLog] = await Promise.all([
      listHelpdeskReunionesForTicket(ticketId),
      listHelpdeskNotasForTicket(ticketId),
      listHelpdeskEmailLogForTicket(ticketId),
    ])

    let asignadoNombre: string | null = null
    if (ticket.asignadoATeamId) {
      const member = await getHelpdeskTeamMemberById(ticket.asignadoATeamId)
      asignadoNombre = member?.nombre?.trim() || null
    }

    res.json({
      ticket: {
        ...serializeHelpdeskTicket(ticket, reuniones, emailLog),
        asignadoNombre,
        notas: notas.map(serializeHelpdeskNota),
      },
    })
  } catch (err) {
    logError('getTicketDetail falló', err)
    res.status(500).json({ error: 'No se pudo cargar el ticket' })
  }
}
