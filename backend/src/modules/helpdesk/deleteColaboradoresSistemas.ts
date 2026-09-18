import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { getHelpdeskTicketById, updateHelpdeskTicketFields } from './repository.js'

export async function deleteColaboradoresSistemasHandler(req: Request, res: Response): Promise<void> {
  const ticketId = String(req.params.ticketId ?? '').trim()
  const teamMemberId = String(req.params.teamMemberId ?? '').trim()
  if (!ticketId || !teamMemberId) {
    res.status(400).json({ error: 'Parámetros inválidos' })
    return
  }

  try {
    const ticket = await getHelpdeskTicketById(ticketId)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    const existing = ticket.colaboradoresSistemas ?? []
    const next = existing.filter((c) => c.teamMemberId !== teamMemberId)
    if (next.length === existing.length) {
      res.status(404).json({ error: 'Colaborador no encontrado en el ticket' })
      return
    }

    await updateHelpdeskTicketFields(ticketId, { colaboradoresSistemas: next })
    res.json({ ticketId, teamMemberId, removed: true })
  } catch (err) {
    logError('deleteColaboradoresSistemas falló', err)
    res.status(500).json({ error: 'No se pudo quitar colaborador' })
  }
}
