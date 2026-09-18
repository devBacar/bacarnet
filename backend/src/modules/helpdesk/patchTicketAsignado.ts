import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import {
  getHelpdeskTeamMemberById,
  getHelpdeskTicketById,
  updateHelpdeskTicket,
} from './repository.js'
import { markHelpdeskVistoSeccionNowForUser } from './vistoPorRepository.js'

export async function patchTicketAsignadoHandler(req: Request, res: Response): Promise<void> {
  const ticketId = String(req.params.ticketId ?? '').trim()
  if (!ticketId) {
    res.status(400).json({ error: 'ticketId inválido' })
    return
  }

  const body = req.body as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Body inválido' })
    return
  }

  const teamMemberId = typeof body.teamMemberId === 'string' ? body.teamMemberId.trim() : ''
  if (!teamMemberId) {
    res.status(400).json({ error: 'teamMemberId es obligatorio' })
    return
  }

  try {
    const ticket = await getHelpdeskTicketById(ticketId)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    const member = await getHelpdeskTeamMemberById(teamMemberId)
    if (!member || !member.activo) {
      res.status(400).json({ error: 'Miembro del equipo no encontrado o inactivo' })
      return
    }

    await updateHelpdeskTicket(ticketId, { asignadoATeamId: teamMemberId })
    await markHelpdeskVistoSeccionNowForUser(ticketId, req.authedUser?.uid, 'seguimiento')
    res.json({ ticketId, asignadoATeamId: teamMemberId })
  } catch (err) {
    logError('patchTicketAsignado falló', err)
    res.status(500).json({ error: 'No se pudo actualizar la asignación' })
  }
}
