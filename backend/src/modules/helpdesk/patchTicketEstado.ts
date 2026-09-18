import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { logHelpdeskEmailAvisoBestEffort } from './logHelpdeskEmailAviso.js'
import { notificarN8n } from './n8nWebhooks.js'
import { getHelpdeskTicketById, updateHelpdeskTicket } from './repository.js'
import { markHelpdeskVistoSeccionNowForUser } from './vistoPorRepository.js'
import { helpdeskEstadoLabelFromIdx, isValidHelpdeskEstadoIdx } from './types.js'

export async function patchTicketEstadoHandler(req: Request, res: Response): Promise<void> {
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

  const estadoIdx = body.estadoIdx
  if (!isValidHelpdeskEstadoIdx(estadoIdx)) {
    res.status(400).json({ error: 'estadoIdx inválido' })
    return
  }

  try {
    const ticket = await getHelpdeskTicketById(ticketId)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    const previousIdx = ticket.estadoIdx
    if (previousIdx === estadoIdx) {
      res.json({ ticketId, estadoIdx })
      return
    }

    await updateHelpdeskTicket(ticketId, { estadoIdx })
    await markHelpdeskVistoSeccionNowForUser(ticketId, req.authedUser?.uid, 'seguimiento')
    const estadoNuevo = helpdeskEstadoLabelFromIdx(estadoIdx)
    await notificarN8n('estado_cambiado', {
      ticketId,
      area: ticket.areaNombre,
      email: ticket.requesterEmail,
      nombre: ticket.requesterNombre,
      estadoNuevo: estadoNuevo ?? '',
    })
    await logHelpdeskEmailAvisoBestEffort({
      tipo: 'actualizacion_estado',
      destinatarios: [ticket.requesterEmail],
      area: ticket.areaNombre,
      areaId: ticket.areaId ?? null,
      ticketId,
    })

    res.json({ ticketId, estadoIdx })
  } catch (err) {
    logError('patchTicketEstado falló', err)
    res.status(500).json({ error: 'No se pudo actualizar el estado' })
  }
}
