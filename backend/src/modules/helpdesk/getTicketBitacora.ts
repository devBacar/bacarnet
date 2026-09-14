import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { listHelpdeskBitacoraForTicket } from './bitacoraRepository.js'
import { bitacoraVisibleForTicket, canAccessHelpdeskBitacora } from './bitacoraAccess.js'
import { serializeHelpdeskBitacoraEntrada } from './serializeBitacora.js'
import { getHelpdeskTicketById } from './repository.js'

export async function getTicketBitacoraHandler(req: Request, res: Response): Promise<void> {
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

    const access = await canAccessHelpdeskBitacora(user, ticket)
    if (!access) {
      res.status(403).json({ error: 'No autorizado' })
      return
    }
    if (!bitacoraVisibleForTicket(ticket)) {
      res.json({ entradas: [] })
      return
    }

    const entradas = await listHelpdeskBitacoraForTicket(ticketId)
    res.json({ entradas: entradas.map(serializeHelpdeskBitacoraEntrada) })
  } catch (err) {
    logError('getTicketBitacora falló', err)
    res.status(500).json({ error: 'No se pudo cargar la bitácora' })
  }
}
