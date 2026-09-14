import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { getEventAttendeeStatus } from './calendar.js'
import {
  getHelpdeskReunionById,
  getHelpdeskTicketById,
  updateHelpdeskReunion,
} from './repository.js'
import type { HelpdeskReunionEstado } from './types.js'

type SyncableTicket = { requesterEmail: string }
type SyncableReunion = {
  estado: HelpdeskReunionEstado
  calendarEventId?: string | null
  calendarOrganizerEmail?: string | null
}

export interface SyncReunionEstadoResult {
  estado: HelpdeskReunionEstado
  previousEstado: HelpdeskReunionEstado
  changed: boolean
  requesterResponseStatus: string
}

export async function syncReunionEstado(input: {
  ticketId: string
  reunionId: string
  ticket?: SyncableTicket
  reunion?: SyncableReunion
  deps?: {
    getTicket: typeof getHelpdeskTicketById
    getReunion: typeof getHelpdeskReunionById
    getAttendeeStatus: typeof getEventAttendeeStatus
    updateReunion: typeof updateHelpdeskReunion
  }
}): Promise<SyncReunionEstadoResult> {
  const deps = input.deps ?? {
    getTicket: getHelpdeskTicketById,
    getReunion: getHelpdeskReunionById,
    getAttendeeStatus: getEventAttendeeStatus,
    updateReunion: updateHelpdeskReunion,
  }
  const ticket = input.ticket ?? (await deps.getTicket(input.ticketId))
  if (!ticket) throw new Error('Ticket no encontrado')

  const reunion = input.reunion ?? (await deps.getReunion(input.ticketId, input.reunionId))
  if (!reunion) throw new Error('Reunión no encontrada')
  if (!reunion.calendarEventId || !reunion.calendarOrganizerEmail) {
    throw new Error('La reunión no tiene evento de Calendar vinculado')
  }

  const attendees = await deps.getAttendeeStatus(
    reunion.calendarOrganizerEmail,
    reunion.calendarEventId,
  )
  const requester = ticket.requesterEmail.trim().toLowerCase()
  const guest = attendees.find((a) => a.email === requester)

  let estado: HelpdeskReunionEstado = 'pendiente'
  if (guest?.responseStatus === 'accepted') estado = 'confirmada'
  else if (guest?.responseStatus === 'declined') estado = 'rechazada'

  const changed = estado !== reunion.estado
  if (changed) {
    await deps.updateReunion(input.ticketId, input.reunionId, { estado })
  }

  return {
    estado,
    previousEstado: reunion.estado,
    changed,
    requesterResponseStatus: guest?.responseStatus ?? 'needsAction',
  }
}

/**
 * Sincronización manual del estado de respuesta del invitado en Calendar.
 * Usa la misma función de dominio que la automatización programada.
 */
export async function syncReunionEstadoHandler(req: Request, res: Response): Promise<void> {
  const ticketId = String(req.params.ticketId ?? '').trim()
  const reunionId = String(req.params.reunionId ?? '').trim()

  if (!ticketId || !reunionId) {
    res.status(400).json({ error: 'ticketId y reunionId son obligatorios' })
    return
  }

  try {
    const result = await syncReunionEstado({ ticketId, reunionId })

    res.json({
      ticketId,
      reunionId,
      estado: result.estado,
      requesterResponseStatus: result.requesterResponseStatus,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message === 'Ticket no encontrado' || message === 'Reunión no encontrada') {
      res.status(404).json({ error: message })
      return
    }
    if (message === 'La reunión no tiene evento de Calendar vinculado') {
      res.status(409).json({ error: message })
      return
    }
    logError('syncReunionEstado falló', err)
    res.status(500).json({ error: 'No se pudo sincronizar el estado de la reunión' })
  }
}
