import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { listJefesAreasRows, type JefeAreaTableRow } from './n8nJefesAreas.js'

const AUDITORIA_ERROR = 'No se pudo obtener el estado de la campaña, intentá de nuevo'

export interface CampanaAuditoriaRow {
  nombre: string | null
  area: string | null
  email: string | null
  enviado: boolean | null
  fecha_envio: string | null
  respondido: boolean | null
  fecha_respuesta: string | null
  link: string | null
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function asBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === 1) return true
  if (value === 'false' || value === 0) return false
  return null
}

function asIsoDate(value: unknown): string | null {
  if (value == null || value === '') return null
  const date = value instanceof Date ? value : new Date(String(value))
  if (!Number.isFinite(date.getTime())) return null
  return date.toISOString()
}

export function serializeCampanaAuditoriaRow(row: JefeAreaTableRow): CampanaAuditoriaRow {
  const json = row.json
  const source =
    json && typeof json === 'object' && !Array.isArray(json)
      ? ({ ...row, ...(json as Record<string, unknown>) } as JefeAreaTableRow)
      : row
  return {
    nombre: asTrimmedString(source.nombre),
    area: asTrimmedString(source.area),
    email: asTrimmedString(source.email),
    enviado: asBool(source.enviado),
    fecha_envio: asIsoDate(source.fecha_envio),
    respondido: asBool(source.respondido),
    fecha_respuesta: asIsoDate(source.fecha_respuesta),
    link: asTrimmedString(source.link),
  }
}

export async function getCampanaAuditoriaHandler(_req: Request, res: Response): Promise<void> {
  try {
    const raw = await listJefesAreasRows()
    res.json({ rows: raw.map(serializeCampanaAuditoriaRow) })
  } catch (err) {
    logError('getCampanaAuditoria falló', err)
    res.status(503).json({ error: AUDITORIA_ERROR })
  }
}
