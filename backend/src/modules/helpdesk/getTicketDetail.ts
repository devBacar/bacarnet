import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { listHelpdeskAnalisisForTicket } from './analisisRepository.js'
import { listHelpdeskBitacoraForTicket } from './bitacoraRepository.js'
import { serializeHelpdeskAnalisis } from './helpdeskDriveUpload.js'
import {
  computeAllSectionActivityMs,
  computeNovedadesPorSeccion,
} from './ticketSectionActivity.js'
import {
  getHelpdeskTeamMemberById,
  getHelpdeskTicketById,
  listHelpdeskEmailLogForTicket,
  listHelpdeskNotasForTicket,
  listHelpdeskReunionesForTicket,
} from './repository.js'
import { serializeHelpdeskNota, serializeHelpdeskTicket } from './serializeTicket.js'
import { getHelpdeskVistoPor } from './vistoPorRepository.js'

export async function getTicketDetailHandler(req: Request, res: Response): Promise<void> {
  const ticketId = String(req.params.ticketId ?? '').trim()
  if (!ticketId) {
    res.status(400).json({ error: 'ticketId inválido' })
    return
  }

  try {
    const ticket = await getHelpdeskTicketById(ticketId)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    const uid = req.authedUser?.uid?.trim() ?? ''

    const [reuniones, notas, emailLog, analisis, bitacora, vistoPor] = await Promise.all([
      listHelpdeskReunionesForTicket(ticketId),
      listHelpdeskNotasForTicket(ticketId),
      listHelpdeskEmailLogForTicket(ticketId),
      listHelpdeskAnalisisForTicket(ticketId),
      listHelpdeskBitacoraForTicket(ticketId),
      uid ? getHelpdeskVistoPor(ticketId, uid) : Promise.resolve(null),
    ])

    const activity = computeAllSectionActivityMs({
      ticket,
      analisis,
      reuniones,
      bitacora,
      emailLog,
    })
    const novedades = uid ? computeNovedadesPorSeccion(activity, vistoPor) : null

    let asignadoNombre: string | null = null
    if (ticket.asignadoATeamId) {
      const member = await getHelpdeskTeamMemberById(ticket.asignadoATeamId)
      asignadoNombre = member?.nombre?.trim() || null
    }

    res.json({
      ticket: {
        ...serializeHelpdeskTicket(ticket, reuniones, emailLog),
        asignadoNombre,
        notas: notas.map(serializeHelpdeskNota),
        analisis: analisis.map(serializeHelpdeskAnalisis),
      },
      novedades,
    })
  } catch (err) {
    logError('getTicketDetail falló', err)
    res.status(500).json({ error: 'No se pudo cargar el ticket' })
  }
}
