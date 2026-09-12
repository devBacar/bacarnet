import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { buildAvailabilitySlotsForEmails } from './buildAvailabilitySlots.js'
import { getHelpdeskTeamMemberById } from './repository.js'

export async function getDisponibilidadTeamMemberHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const teamMemberId = String(req.params.teamMemberId ?? '').trim()
  if (!teamMemberId) {
    res.status(400).json({ error: 'teamMemberId inválido' })
    return
  }

  const semanaOffsetRaw = typeof req.query.semanaOffset === 'string' ? req.query.semanaOffset : '0'
  const semanaOffset = Number.parseInt(semanaOffsetRaw, 10)

  try {
    const member = await getHelpdeskTeamMemberById(teamMemberId)
    if (!member || !member.activo) {
      res.status(404).json({ error: 'Miembro del equipo no encontrado o inactivo' })
      return
    }

    const slots = await buildAvailabilitySlotsForEmails(
      [member.email],
      Number.isFinite(semanaOffset) ? semanaOffset : 0,
    )
    res.json({ slots, teamMemberId: member.id, nombre: member.nombre })
  } catch (err) {
    logError('getDisponibilidadTeamMember falló', err)
    res.status(500).json({ error: 'No se pudo consultar la disponibilidad' })
  }
}
