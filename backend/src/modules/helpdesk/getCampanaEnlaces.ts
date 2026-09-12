import type { Request, Response } from 'express'
import { getEnv } from '../../config/env.js'
import { logError } from '../../lib/log.js'
import { listAssignableRootAreas } from '../areas/listAssignableRootAreas.js'
import { resolveAreaChiefs } from '../notifications/resolveRecipients.js'
import { generarTokenSolicitud } from './accessToken.js'

export interface HelpdeskCampanaEnlace {
  areaId: string
  areaNombre: string
  email: string
  nombre: string
  link: string
}

export interface HelpdeskAreaSinJefe {
  areaId: string
  areaNombre: string
}

function buildSupportLink(publicAppUrl: string, token: string): string {
  const base = publicAppUrl.replace(/\/+$/, '')
  return `${base}/support?t=${encodeURIComponent(token)}`
}

export async function getCampanaEnlacesHandler(_req: Request, res: Response): Promise<void> {
  try {
    const { publicAppUrl } = getEnv()
    const areas = await listAssignableRootAreas()
    const enlaces: HelpdeskCampanaEnlace[] = []
    const areasSinJefe: HelpdeskAreaSinJefe[] = []

    for (const area of areas) {
      const chiefs = await resolveAreaChiefs(area.id)
      if (chiefs.length === 0) {
        areasSinJefe.push({ areaId: area.id, areaNombre: area.name })
        continue
      }

      for (const chief of chiefs) {
        const nombre = chief.displayName?.trim() || chief.email.split('@')[0] || chief.email
        const token = generarTokenSolicitud({
          uid: chief.uid,
          email: chief.email,
          nombre,
          areaId: area.id,
          areaNombre: area.name,
        })
        enlaces.push({
          areaId: area.id,
          areaNombre: area.name,
          email: chief.email,
          nombre,
          link: buildSupportLink(publicAppUrl, token),
        })
      }
    }

    res.json({ enlaces, areasSinJefe })
  } catch (err) {
    logError('getCampanaEnlaces falló', err)
    res.status(500).json({ error: 'No se pudieron generar los enlaces de campaña' })
  }
}
