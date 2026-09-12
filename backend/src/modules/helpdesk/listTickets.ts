import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import {
  getHelpdeskTeamMemberById,
  isValidHelpdeskUrgencia,
  listHelpdeskEmailLogForTicket,
  listHelpdeskReunionesForTicket,
  listHelpdeskTickets,
} from './repository.js'
import { serializeHelpdeskTicket } from './serializeTicket.js'
import { isValidHelpdeskEstadoIdx } from './types.js'

export async function listTicketsHandler(req: Request, res: Response): Promise<void> {
  const estadoIdxRaw = typeof req.query.estadoIdx === 'string' ? req.query.estadoIdx.trim() : ''
  const urgenciaRaw = typeof req.query.urgencia === 'string' ? req.query.urgencia.trim() : ''

  let estadoIdx: number | undefined
  if (estadoIdxRaw !== '') {
    const parsed = Number.parseInt(estadoIdxRaw, 10)
    if (!isValidHelpdeskEstadoIdx(parsed)) {
      res.status(400).json({ error: 'estadoIdx inválido' })
      return
    }
    estadoIdx = parsed
  }

  let urgencia: 'baja' | 'media' | 'alta' | undefined
  if (urgenciaRaw !== '') {
    if (!isValidHelpdeskUrgencia(urgenciaRaw)) {
      res.status(400).json({ error: 'urgencia inválida' })
      return
    }
    urgencia = urgenciaRaw
  }

  try {
    const tickets = await listHelpdeskTickets({ estadoIdx, urgencia })
    const serialized = await Promise.all(
      tickets.map(async (ticket) => {
        const [reuniones, emailLog] = await Promise.all([
          listHelpdeskReunionesForTicket(ticket.id),
          listHelpdeskEmailLogForTicket(ticket.id),
        ])
        let asignadoNombre: string | null = null
        if (ticket.asignadoATeamId) {
          const member = await getHelpdeskTeamMemberById(ticket.asignadoATeamId)
          asignadoNombre = member?.nombre?.trim() || null
        }
        return {
          ...serializeHelpdeskTicket(ticket, reuniones, emailLog),
          asignadoNombre,
        }
      }),
    )
    res.json({ tickets: serialized })
  } catch (err) {
    logError('listTickets falló', err)
    res.status(500).json({ error: 'No se pudo listar tickets' })
  }
}
