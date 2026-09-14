import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import {
  getHelpdeskAnalisisById,
  updateHelpdeskAnalisisDecision,
} from './analisisRepository.js'
import { notificarN8n } from './n8nWebhooks.js'
import { getHelpdeskTicketById, updateHelpdeskTicket } from './repository.js'
import { helpdeskEstadoLabelFromIdx } from './types.js'

const SISTEMAS_AVISO_EMAIL = 'admin@bacarsa.com.ar'

export async function patchAnalisisDecisionHandler(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const ticketId = String(req.params.ticketId ?? '').trim()
  const analisisId = String(req.params.analisisId ?? '').trim()
  if (!ticketId || !analisisId) {
    res.status(400).json({ error: 'Parámetros inválidos' })
    return
  }

  const body = req.body as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Body inválido' })
    return
  }

  const decision = body.decision
  if (decision !== 'aprobado' && decision !== 'rechazado') {
    res.status(400).json({ error: "decision debe ser 'aprobado' o 'rechazado'" })
    return
  }

  const comentario =
    typeof body.comentario === 'string' ? body.comentario.trim().slice(0, 2000) : ''
  const comentarioDecision =
    comentario ||
    (decision === 'rechazado' ? 'Análisis rechazado' : null)

  const userEmail = user.email.trim().toLowerCase()

  try {
    const ticket = await getHelpdeskTicketById(ticketId)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    const analisis = await getHelpdeskAnalisisById(ticketId, analisisId)
    if (!analisis) {
      res.status(404).json({ error: 'Análisis no encontrado' })
      return
    }
    if (analisis.estado !== 'pendiente') {
      res.status(409).json({ error: 'Este análisis ya fue decidido' })
      return
    }

    const approvers = analisis.aprobadoresEmails.map((e) => e.trim().toLowerCase())
    if (!approvers.includes(userEmail)) {
      res.status(403).json({ error: 'No estás autorizado a decidir sobre este análisis' })
      return
    }

    await updateHelpdeskAnalisisDecision({
      ticketId,
      analisisId,
      estado: decision,
      decididoPorEmail: userEmail,
      comentarioDecision,
    })

    if (decision === 'aprobado') {
      await updateHelpdeskTicket(ticketId, { estadoIdx: 3 })
      const estadoNuevo = helpdeskEstadoLabelFromIdx(3) ?? ''
      await notificarN8n('estado_cambiado', {
        ticketId,
        area: ticket.areaNombre,
        email: ticket.requesterEmail,
        nombre: ticket.requesterNombre,
        estadoNuevo,
      })
      await notificarN8n('aviso_interno', {
        tipoAviso: 'analisis_aprobado',
        destinatarioEmail: SISTEMAS_AVISO_EMAIL,
        ticketId,
        area: ticket.areaNombre,
        problematica: ticket.problematica,
        decididoPorEmail: userEmail,
        comentario: comentario || null,
        archivoDriveLink: analisis.archivoDriveLink,
      })
    } else {
      await notificarN8n('aviso_interno', {
        tipoAviso: 'analisis_rechazado',
        destinatarioEmail: SISTEMAS_AVISO_EMAIL,
        ticketId,
        area: ticket.areaNombre,
        problematica: ticket.problematica,
        decididoPorEmail: userEmail,
        comentario: comentarioDecision,
        archivoDriveLink: analisis.archivoDriveLink,
      })
    }

    res.json({ ticketId, analisisId, decision })
  } catch (err) {
    logError('patchAnalisisDecision falló', err)
    res.status(500).json({ error: 'No se pudo registrar la decisión' })
  }
}
