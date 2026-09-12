import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { getEventAttendeeStatus } from './calendar.js'
import {
  getHelpdeskReunionById,
  getHelpdeskTicketById,
  updateHelpdeskReunion,
} from './repository.js'
import type { HelpdeskReunionEstado } from './types.js'

/**
 * Sincronización manual del estado de respuesta del invitado en Calendar.
 * Próximo paso (otro prompt): cron o push notifications de Google Calendar para
 * actualizar automáticamente sin llamar a este endpoint.
 */
export async function syncReunionEstadoHandler(req: Request, res: Response): Promise<void> {
  const ticketId = String(req.params.ticketId ?? '').trim()
  const reunionId = String(req.params.reunionId ?? '').trim()

  if (!ticketId || !reunionId) {
    res.status(400).json({ error: 'ticketId y reunionId son obligatorios' })
    return
  }

  try {
    const ticket = await getHelpdeskTicketById(ticketId)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    const reunion = await getHelpdeskReunionById(ticketId, reunionId)
    if (!reunion) {
      res.status(404).json({ error: 'Reunión no encontrada' })
      return
    }

    if (!reunion.calendarEventId || !reunion.calendarOrganizerEmail) {
      res.status(409).json({ error: 'La reunión no tiene evento de Calendar vinculado' })
      return
    }

    const attendees = await getEventAttendeeStatus(
      reunion.calendarOrganizerEmail,
      reunion.calendarEventId,
    )
    const requester = ticket.requesterEmail.trim().toLowerCase()
    const guest = attendees.find((a) => a.email === requester)

    let estado: HelpdeskReunionEstado = reunion.estado
    if (guest?.responseStatus === 'accepted') {
      estado = 'confirmada'
    } else if (guest?.responseStatus === 'declined') {
      estado = 'rechazada'
    } else {
      estado = 'pendiente'
    }

    if (estado !== reunion.estado) {
      await updateHelpdeskReunion(ticketId, reunionId, { estado })
    }

    res.json({
      ticketId,
      reunionId,
      estado,
      requesterResponseStatus: guest?.responseStatus ?? 'needsAction',
    })
  } catch (err) {
    logError('syncReunionEstado falló', err)
    res.status(500).json({ error: 'No se pudo sincronizar el estado de la reunión' })
  }
}
