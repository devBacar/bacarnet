import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { getHelpdeskTicketById } from './repository.js'
import { isHelpdeskVistoSeccion } from './vistoPorTypes.js'
import { markHelpdeskVistoSeccion } from './vistoPorRepository.js'

export async function patchTicketVistoPorHandler(req: Request, res: Response): Promise<void> {
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
  const seccion = body?.seccion
  if (!isHelpdeskVistoSeccion(seccion)) {
    res.status(400).json({ error: 'seccion inválida' })
    return
  }

  try {
    const ticket = await getHelpdeskTicketById(ticketId)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    await markHelpdeskVistoSeccion(ticketId, user.uid, seccion)
    res.json({ ticketId, seccion, ok: true })
  } catch (err) {
    logError('patchTicketVistoPor falló', err)
    res.status(500).json({ error: 'No se pudo registrar la revisión' })
  }
}
