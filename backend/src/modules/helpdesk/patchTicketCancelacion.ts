import type { Request, Response } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { logError } from '../../lib/log.js'
import { getHelpdeskTicketById, updateHelpdeskTicketCancelacion } from './repository.js'
import { markHelpdeskVistoSeccionNowForUser } from './vistoPorRepository.js'

export async function patchTicketCancelacionHandler(req: Request, res: Response): Promise<void> {
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

  const body = req.body as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Body inválido' })
    return
  }

  if (typeof body.cancelado !== 'boolean') {
    res.status(400).json({ error: 'cancelado debe ser boolean' })
    return
  }

  const motivo =
    typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 2000) : null

  try {
    const ticket = await getHelpdeskTicketById(ticketId)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    if (body.cancelado) {
      await updateHelpdeskTicketCancelacion(ticketId, {
        cancelado: true,
        canceladoMotivo: motivo || null,
        canceladoPor: user.email.trim().toLowerCase(),
        canceladoFecha: FieldValue.serverTimestamp(),
      })
    } else {
      await updateHelpdeskTicketCancelacion(ticketId, {
        cancelado: false,
        canceladoMotivo: null,
        canceladoPor: null,
        canceladoFecha: null,
      })
    }

    await markHelpdeskVistoSeccionNowForUser(ticketId, user.uid, 'seguimiento')

    res.json({ ticketId, cancelado: body.cancelado })
  } catch (err) {
    logError('patchTicketCancelacion falló', err)
    res.status(500).json({ error: 'No se pudo actualizar la cancelación' })
  }
}
