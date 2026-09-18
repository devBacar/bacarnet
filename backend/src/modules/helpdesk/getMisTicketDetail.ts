import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import {
  getHelpdeskTeamMemberById,
  getHelpdeskTicketById,
  listHelpdeskReunionesForTicket,
} from './repository.js'
import {
  serializeColaboradorSolicitante,
} from './serializeColaboradores.js'
import { serializeHelpdeskTicket } from './serializeTicket.js'
import { canViewMisProyectoTicket, misProyectoAccesoRol } from './ticketCollaboratorAccess.js'

export async function getMisTicketDetailHandler(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

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

    if (!canViewMisProyectoTicket(user, ticket)) {
      res.status(403).json({ error: 'No autorizado' })
      return
    }

    const reuniones = await listHelpdeskReunionesForTicket(ticketId)
    let asignadoNombre: string | null = null
    if (ticket.asignadoATeamId) {
      const member = await getHelpdeskTeamMemberById(ticket.asignadoATeamId)
      asignadoNombre = member?.nombre?.trim() || null
    }

    const miRolAcceso = misProyectoAccesoRol(user, ticket)

    res.json({
      ticket: {
        ...serializeHelpdeskTicket(ticket, reuniones),
        asignadoNombre,
        colaboradoresSolicitante: (ticket.colaboradoresSolicitante ?? []).map(
          serializeColaboradorSolicitante,
        ),
        miRolAcceso,
      },
    })
  } catch (err) {
    logError('getMisTicketDetail falló', err)
    res.status(500).json({ error: 'No se pudo cargar el proyecto' })
  }
}
