import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { attachCalendarEventToReunion } from './calendarAttach.js'
import { getFreeBusyForEmails } from './calendar.js'
import { verificarToken } from './accessToken.js'
import {
  HelpdeskTokenAlreadyUsedError,
  HelpdeskTokenError,
  HELPDESK_TOKEN_INVALID_MESSAGE,
} from './errors.js'
import {
  createHelpdeskTicketWithInitialReunion,
  isValidHelpdeskUrgencia,
  listPrimeraReunionTeamMembers,
  pickDireccionTeamMember,
} from './repository.js'
import { notificarN8n } from './n8nWebhooks.js'
import { ticketPayloadForN8n } from './serializeTicket.js'
import {
  isJointSlotFree,
  isValidSlotLabel,
  parseSlotLabels,
} from './slotScheduling.js'

export async function createSolicitudHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Body inválido' })
    return
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const problematica = typeof body.problematica === 'string' ? body.problematica.trim() : ''
  const urgencia = body.urgencia
  const fecha = body.fecha
  const hora = body.hora

  if (!token) {
    res.status(400).json({ error: 'token es obligatorio' })
    return
  }
  if (!problematica) {
    res.status(400).json({ error: 'problematica es obligatoria' })
    return
  }
  if (!isValidHelpdeskUrgencia(urgencia)) {
    res.status(400).json({ error: 'urgencia debe ser baja, media o alta' })
    return
  }
  if (!isValidSlotLabel(fecha, hora)) {
    res.status(400).json({ error: 'fecha y hora del turno son obligatorias (DD/MM/YYYY y HH:00)' })
    return
  }

  let claims
  try {
    claims = await verificarToken(token)
  } catch (err) {
    if (err instanceof HelpdeskTokenError || err instanceof HelpdeskTokenAlreadyUsedError) {
      res.status(401).json({ error: HELPDESK_TOKEN_INVALID_MESSAGE })
      return
    }
    logError('createSolicitud: fallo al verificar token', err)
    res.status(500).json({ error: 'No se pudo validar el enlace de solicitud' })
    return
  }

  const fechaStr = (fecha as string).trim()
  const horaStr = (hora as string).trim()

  try {
    const primeraReunionTeam = await listPrimeraReunionTeamMembers()
    const teamEmails = primeraReunionTeam.map((m) => m.email)
    const direccion = pickDireccionTeamMember(primeraReunionTeam)

    if (teamEmails.length === 0 || !direccion) {
      res.status(503).json({ error: 'No hay equipo de primera reunión configurado' })
      return
    }

    const { startISO, endISO } = parseSlotLabels(fechaStr, horaStr)
    const busyByEmail = await getFreeBusyForEmails(teamEmails, startISO, endISO)
    if (!isJointSlotFree(busyByEmail, teamEmails, fechaStr, horaStr)) {
      res.status(409).json({
        error: 'slot_ocupado',
        mensaje: 'Ese horario se ocupó mientras completabas el formulario, elegí otro.',
      })
      return
    }

    const participantesTeamIds = primeraReunionTeam
      .filter((m) => m.id !== direccion.id)
      .map((m) => m.id)

    const { ticketId, reunionId } = await createHelpdeskTicketWithInitialReunion({
      jti: claims.jti,
      token,
      ticket: {
        token,
        requesterUid: claims.uid,
        requesterEmail: claims.email,
        requesterNombre: claims.nombre,
        areaId: claims.areaId,
        areaNombre: claims.areaNombre,
        problematica,
        urgencia,
        estadoIdx: 1,
        asignadoATeamId: direccion.id,
      },
      reunion: {
        tipo: 'Reunión inicial',
        conTeamId: direccion.id,
        participantesTeamIds,
        fecha: fechaStr,
        hora: horaStr,
        estado: 'pendiente',
      },
    })

    const francoEmail = participantesTeamIds
      .map((id) => primeraReunionTeam.find((m) => m.id === id)?.email)
      .find((e): e is string => Boolean(e))

    const attendeeEmails = [claims.email]
    if (francoEmail && francoEmail !== claims.email) {
      attendeeEmails.push(francoEmail)
    }

    await attachCalendarEventToReunion({
      ticketId,
      reunionId,
      organizerEmail: direccion.email,
      attendeeEmails,
      summary: `Sistemas · Primera reunión — ${claims.areaNombre}`,
      description: problematica,
      startISO,
      endISO,
    })

    await notificarN8n('solicitud_creada', {
      ...ticketPayloadForN8n({
        id: ticketId,
        token,
        requesterUid: claims.uid,
        requesterEmail: claims.email,
        requesterNombre: claims.nombre,
        areaId: claims.areaId,
        areaNombre: claims.areaNombre,
        problematica,
        urgencia,
        estadoIdx: 1,
        asignadoATeamId: direccion.id,
      }),
      reunionId,
      reunionFecha: fechaStr,
      reunionHora: horaStr,
    })

    res.status(201).json({
      ticketId,
      areaNombre: claims.areaNombre,
      requesterNombre: claims.nombre,
    })
  } catch (err) {
    if (err instanceof HelpdeskTokenAlreadyUsedError) {
      res.status(401).json({ error: HELPDESK_TOKEN_INVALID_MESSAGE })
      return
    }
    logError('createSolicitud: fallo al crear ticket', err)
    res.status(500).json({ error: 'No se pudo registrar la solicitud' })
  }
}
