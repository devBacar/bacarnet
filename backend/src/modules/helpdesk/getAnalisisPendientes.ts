import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { listHelpdeskAnalisisPendientesForApprover } from './analisisRepository.js'
import { serializeHelpdeskAnalisis } from './helpdeskDriveUpload.js'

export async function getAnalisisPendientesHandler(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  try {
    const rows = await listHelpdeskAnalisisPendientesForApprover(user.email)
    res.json({
      items: rows.map((row) => ({
        ticketId: row.ticketId,
        analisisId: row.id,
        analisis: serializeHelpdeskAnalisis(row),
        ticket: {
          id: row.ticket.id,
          areaNombre: row.ticket.areaNombre,
          problematica: row.ticket.problematica,
          requesterNombre: row.ticket.requesterNombre,
          estadoIdx: row.ticket.estadoIdx,
        },
      })),
    })
  } catch (err) {
    logError('getAnalisisPendientes falló', err)
    res.status(500).json({ error: 'No se pudieron listar los análisis pendientes' })
  }
}
