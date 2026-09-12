import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { createHelpdeskTicketNota, getHelpdeskTicketById } from './repository.js'

export async function postTicketNotaHandler(req: Request, res: Response): Promise<void> {
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

  const texto = typeof body.texto === 'string' ? body.texto.trim() : ''
  if (!texto) {
    res.status(400).json({ error: 'texto es obligatorio' })
    return
  }

  const autor = req.authedUser
  if (!autor) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const autorNombre = autor.displayName.trim() || autor.email

  try {
    const ticket = await getHelpdeskTicketById(ticketId)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    const notaId = await createHelpdeskTicketNota({
      ticketId,
      autorNombre,
      texto,
    })

    res.status(201).json({ notaId, ticketId })
  } catch (err) {
    logError('postTicketNota falló', err)
    res.status(500).json({ error: 'No se pudo crear la nota' })
  }
}
