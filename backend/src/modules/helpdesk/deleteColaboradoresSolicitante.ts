import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { getHelpdeskTicketById, updateHelpdeskTicketFields } from './repository.js'
import {
  isTicketRequester,
  syncColaboradorIndexFields,
} from './ticketCollaboratorAccess.js'

export async function deleteColaboradoresSolicitanteHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const ticketId = String(req.params.ticketId ?? '').trim()
  const emailParam = String(req.params.email ?? '').trim().toLowerCase()
  if (!ticketId || !emailParam) {
    res.status(400).json({ error: 'Parámetros inválidos' })
    return
  }

  try {
    const ticket = await getHelpdeskTicketById(ticketId)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    if (!isTicketRequester(user, ticket)) {
      res.status(403).json({ error: 'Solo el solicitante original puede quitar colaboradores' })
      return
    }

    const existing = ticket.colaboradoresSolicitante ?? []
    const next = existing.filter((c) => c.email.trim().toLowerCase() !== emailParam)
    if (next.length === existing.length) {
      res.status(404).json({ error: 'Colaborador no encontrado' })
      return
    }

    const indexFields = syncColaboradorIndexFields(next)
    await updateHelpdeskTicketFields(ticketId, {
      colaboradoresSolicitante: next,
      ...indexFields,
    })

    res.json({ ticketId, email: emailParam, removed: true })
  } catch (err) {
    logError('deleteColaboradoresSolicitante falló', err)
    res.status(500).json({ error: 'No se pudo quitar colaborador' })
  }
}
