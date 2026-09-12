import { Timestamp } from 'firebase-admin/firestore'
import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { appendHelpdeskEmailLog } from './repository.js'
import { isValidHelpdeskEmailLogTipo } from './types.js'

function parseOptionalFecha(value: unknown): Timestamp | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      return Timestamp.fromDate(new Date(parsed))
    }
    return undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Timestamp.fromMillis(value)
  }
  return undefined
}

export async function postWebhookCorreoEnviadoHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Body inválido' })
    return
  }

  const tipo = body.tipo
  if (!isValidHelpdeskEmailLogTipo(tipo)) {
    res.status(400).json({ error: 'tipo inválido' })
    return
  }

  const destinatariosRaw = body.destinatarios
  if (!Array.isArray(destinatariosRaw) || destinatariosRaw.length === 0) {
    res.status(400).json({ error: 'destinatarios debe ser un array no vacío' })
    return
  }
  const destinatarios = destinatariosRaw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
  if (destinatarios.length === 0) {
    res.status(400).json({ error: 'destinatarios debe incluir al menos un email' })
    return
  }

  const area = typeof body.area === 'string' ? body.area.trim() : ''
  if (!area) {
    res.status(400).json({ error: 'area es obligatoria' })
    return
  }

  const ticketId =
    typeof body.ticketId === 'string' && body.ticketId.trim() ? body.ticketId.trim() : null

  const fecha = parseOptionalFecha(body.fecha)

  try {
    const logId = await appendHelpdeskEmailLog({
      tipo,
      destinatarios,
      area,
      ticketId,
      fecha,
    })
    res.status(201).json({ logId })
  } catch (err) {
    logError('postWebhookCorreoEnviado falló', err)
    res.status(500).json({ error: 'No se pudo registrar el correo enviado' })
  }
}
