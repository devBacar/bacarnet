import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import {
  getHelpdeskTeamMemberById,
  listHelpdeskReunionesForTicket,
  listHelpdeskTicketsForRequester,
} from './repository.js'
import {
  serializeColaboradorSolicitante,
} from './serializeColaboradores.js'
import { serializeHelpdeskTicket } from './serializeTicket.js'
import { misProyectoAccesoRol } from './ticketCollaboratorAccess.js'

export async function listMisTicketsHandler(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  try {
    const tickets = await listHelpdeskTicketsForRequester({
      uid: user.uid,
      email: user.email,
    })
    const serialized = await Promise.all(
      tickets.map(async (ticket) => {
        const reuniones = await listHelpdeskReunionesForTicket(ticket.id)
        let asignadoNombre: string | null = null
        if (ticket.asignadoATeamId) {
          const member = await getHelpdeskTeamMemberById(ticket.asignadoATeamId)
          asignadoNombre = member?.nombre?.trim() || null
        }
        const miRolAcceso = misProyectoAccesoRol(user, ticket)
        return {
          ...serializeHelpdeskTicket(ticket, reuniones),
          asignadoNombre,
          miRolAcceso,
          colaboradoresSolicitante: (ticket.colaboradoresSolicitante ?? []).map(
            serializeColaboradorSolicitante,
          ),
        }
      }),
    )
    res.json({ tickets: serialized })
  } catch (err) {
    logError('listMisTickets falló', err)
    res.status(500).json({ error: 'No se pudo listar tus solicitudes' })
  }
}
