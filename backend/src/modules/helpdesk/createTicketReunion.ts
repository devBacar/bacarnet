import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { attachCalendarEventToReunion } from './calendarAttach.js'
import { getFreeBusyForEmails } from './calendar.js'
import {
  createHelpdeskTicketReunion,
  getHelpdeskTeamMemberById,
  getHelpdeskTicketById,
} from './repository.js'
import { logHelpdeskEmailAvisoBestEffort } from './logHelpdeskEmailAviso.js'
import { notificarN8n } from './n8nWebhooks.js'
import { markHelpdeskVistoSeccionNowForUser } from './vistoPorRepository.js'
import { isJointSlotFree, isValidSlotLabel, parseSlotLabels } from './slotScheduling.js'

export async function createTicketReunionHandler(req: Request, res: Response): Promise<void> {
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

  const tipo = typeof body.tipo === 'string' ? body.tipo.trim() : ''
  const teamMemberId = typeof body.teamMemberId === 'string' ? body.teamMemberId.trim() : ''
  const fecha = body.fecha
  const hora = body.hora

  if (!tipo || !teamMemberId) {
    res.status(400).json({ error: 'tipo y teamMemberId son obligatorios' })
    return
  }
  if (!isValidSlotLabel(fecha, hora)) {
    res.status(400).json({ error: 'fecha y hora inválidas (DD/MM/YYYY y HH:00)' })
    return
  }

  const fechaStr = (fecha as string).trim()
  const horaStr = (hora as string).trim()

  try {
    const ticket = await getHelpdeskTicketById(ticketId)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    const member = await getHelpdeskTeamMemberById(teamMemberId)
    if (!member || !member.activo) {
      res.status(404).json({ error: 'Miembro del equipo no encontrado o inactivo' })
      return
    }

    const { startISO, endISO } = parseSlotLabels(fechaStr, horaStr)
    const busyByEmail = await getFreeBusyForEmails([member.email], startISO, endISO)
    if (!isJointSlotFree(busyByEmail, [member.email], fechaStr, horaStr)) {
      res.status(409).json({
        error: 'slot_ocupado',
        mensaje: 'Ese horario se ocupó mientras completabas el formulario, elegí otro.',
      })
      return
    }

    const reunionId = await createHelpdeskTicketReunion({
      ticketId,
      reunion: {
        tipo,
        conTeamId: member.id,
        participantesTeamIds: [],
        fecha: fechaStr,
        hora: horaStr,
        estado: 'pendiente',
      },
    })

    await attachCalendarEventToReunion({
      ticketId,
      reunionId,
      organizerEmail: member.email,
      attendeeEmails: [ticket.requesterEmail],
      summary: `Sistemas · ${tipo} — ${ticket.areaNombre}`,
      description: ticket.problematica,
      startISO,
      endISO,
    })

    await notificarN8n('aviso_interno', {
      tipoAviso: 'reunion_creada',
      destinatarioEmail: member.email,
      destinatarioNombre: member.nombre,
      ticketId,
      area: ticket.areaNombre,
      problematica: ticket.problematica,
      urgencia: ticket.urgencia,
      reunionTipo: tipo,
      reunionFecha: fechaStr,
      reunionHora: horaStr,
    })
    await logHelpdeskEmailAvisoBestEffort({
      tipo: 'aviso_interno_reunion',
      destinatarios: [member.email],
      area: ticket.areaNombre,
      areaId: ticket.areaId ?? null,
      ticketId,
    })

    await markHelpdeskVistoSeccionNowForUser(ticketId, req.authedUser?.uid, 'reuniones')

    res.status(201).json({ reunionId, ticketId })
  } catch (err) {
    logError('createTicketReunion falló', err)
    res.status(500).json({ error: 'No se pudo crear la reunión' })
  }
}
