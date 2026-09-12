import type { Request, Response } from 'express'
import { findAssignableRootAreaIdByName } from '../areas/listAssignableRootAreas.js'
import { resolveUidByEmail } from '../notifications/resolveRecipients.js'
import { getEnv } from '../../config/env.js'
import { logError } from '../../lib/log.js'
import { generarTokenSolicitud } from './accessToken.js'

function buildSupportLink(publicAppUrl: string, token: string): string {
  const base = publicAppUrl.replace(/\/+$/, '')
  return `${base}/support?t=${encodeURIComponent(token)}`
}

function readRequiredString(body: unknown, field: string): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ''
  const value = (body as Record<string, unknown>)[field]
  return typeof value === 'string' ? value.trim() : ''
}

export async function postCampanaGenerarEnlaceHandler(req: Request, res: Response): Promise<void> {
  const email = readRequiredString(req.body, 'email').toLowerCase()
  const nombre = readRequiredString(req.body, 'nombre')
  const areaNombre = readRequiredString(req.body, 'areaNombre')

  if (!email || !nombre || !areaNombre) {
    res.status(400).json({ error: 'email, nombre y areaNombre son obligatorios' })
    return
  }

  if (!email.includes('@')) {
    res.status(400).json({ error: 'email inválido' })
    return
  }

  try {
    let areaId: string | null = await findAssignableRootAreaIdByName(areaNombre)
    if (!areaId) {
      console.warn(
        `postCampanaGenerarEnlace: no se encontró folder para areaNombre="${areaNombre}"; se usa areaId=unknown en el token`,
      )
      areaId = 'unknown'
    }

    const uid = await resolveUidByEmail(email)

    const token = generarTokenSolicitud({
      uid,
      email,
      nombre,
      areaId,
      areaNombre,
    })

    const { publicAppUrl } = getEnv()
    res.json({ link: buildSupportLink(publicAppUrl, token) })
  } catch (err) {
    logError('postCampanaGenerarEnlace falló', err)
    res.status(500).json({ error: 'No se pudo generar el enlace' })
  }
}
