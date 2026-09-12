import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { buildAvailabilitySlotsForEmails } from './buildAvailabilitySlots.js'
import {
  HelpdeskTokenAlreadyUsedError,
  HelpdeskTokenError,
  HELPDESK_TOKEN_INVALID_MESSAGE,
} from './errors.js'
import { verificarToken } from './accessToken.js'
import { listPrimeraReunionTeamMembers } from './repository.js'

export async function getDisponibilidadInicialHandler(req: Request, res: Response): Promise<void> {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : ''
  const semanaOffsetRaw = typeof req.query.semanaOffset === 'string' ? req.query.semanaOffset : '0'
  const semanaOffset = Number.parseInt(semanaOffsetRaw, 10)

  if (!token) {
    res.status(400).json({ error: 'token es obligatorio' })
    return
  }

  try {
    await verificarToken(token)
  } catch (err) {
    if (err instanceof HelpdeskTokenError || err instanceof HelpdeskTokenAlreadyUsedError) {
      res.status(401).json({ error: HELPDESK_TOKEN_INVALID_MESSAGE })
      return
    }
    logError('disponibilidad-inicial: fallo al verificar token', err)
    res.status(500).json({ error: 'No se pudo validar el enlace' })
    return
  }

  try {
    const team = await listPrimeraReunionTeamMembers()
    const emails = team.map((m) => m.email).filter(Boolean)
    if (emails.length === 0) {
      res.status(503).json({ error: 'No hay equipo de primera reunión configurado' })
      return
    }

    const slots = await buildAvailabilitySlotsForEmails(
      emails,
      Number.isFinite(semanaOffset) ? semanaOffset : 0,
    )

    res.json({ slots })
  } catch (err) {
    logError('disponibilidad-inicial: fallo', err)
    res.status(500).json({ error: 'No se pudo consultar la disponibilidad' })
  }
}
