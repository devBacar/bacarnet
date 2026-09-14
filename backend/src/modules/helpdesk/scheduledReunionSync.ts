import { logError, logInfo } from '../../lib/log.js'
import {
  listHelpdeskReunionesForTicket,
  listHelpdeskTickets,
} from './repository.js'
import { syncReunionEstado } from './syncReunionEstado.js'
import { HELPDESK_TICKET_ESTADOS } from './types.js'

type TicketRow = Awaited<ReturnType<typeof listHelpdeskTickets>>[number]
type ReunionRow = Awaited<ReturnType<typeof listHelpdeskReunionesForTicket>>[number]

export interface ScheduledReunionSyncSummary {
  ticketsActivos: number
  revisadas: number
  cambiadas: number
  omitidasSinCalendar: number
  errores: number
}

export async function runScheduledReunionSync(deps?: {
  listTickets: () => Promise<TicketRow[]>
  listReuniones: (ticketId: string) => Promise<ReunionRow[]>
  sync: typeof syncReunionEstado
}): Promise<ScheduledReunionSyncSummary> {
  const services = deps ?? {
    listTickets: () => listHelpdeskTickets(),
    listReuniones: listHelpdeskReunionesForTicket,
    sync: syncReunionEstado,
  }
  const finalEstadoIdx = HELPDESK_TICKET_ESTADOS.length - 1
  const tickets = (await services.listTickets()).filter((ticket) => ticket.estadoIdx !== finalEstadoIdx)
  const summary: ScheduledReunionSyncSummary = {
    ticketsActivos: tickets.length,
    revisadas: 0,
    cambiadas: 0,
    omitidasSinCalendar: 0,
    errores: 0,
  }

  for (const ticket of tickets) {
    const reuniones = (await services.listReuniones(ticket.id)).filter(
      (reunion) => reunion.estado === 'pendiente',
    )
    for (const reunion of reuniones) {
      if (!reunion.calendarEventId || !reunion.calendarOrganizerEmail) {
        summary.omitidasSinCalendar++
        continue
      }
      summary.revisadas++
      try {
        const result = await services.sync({
          ticketId: ticket.id,
          reunionId: reunion.id,
          ticket,
          reunion,
        })
        if (result.changed) summary.cambiadas++
      } catch (err) {
        summary.errores++
        logError(
          `helpdesk scheduled sync: ticket=${ticket.id} reunion=${reunion.id}`,
          err,
        )
      }
    }
  }

  logInfo('helpdesk scheduled sync finalizado', { ...summary })
  return summary
}
