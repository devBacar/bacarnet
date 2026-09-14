import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { deleteHelpdeskTicketCompletely } from './deleteHelpdeskTicket.js'
import { getHelpdeskTicketById } from './repository.js'

export async function deleteTicketHandler(req: Request, res: Response): Promise<void> {
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

    const deleted = await deleteHelpdeskTicketCompletely(ticketId)
    if (!deleted) {
      res.status(500).json({ error: 'No se pudo eliminar el proyecto' })
      return
    }

    res.status(200).json({ ticketId, deleted: true })
  } catch (err) {
    logError('deleteTicketHandler falló', err)
    res.status(500).json({ error: 'No se pudo eliminar el proyecto' })
  }
}
