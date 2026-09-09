import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { listAssignableRootAreas } from './listAssignableRootAreas.js'

/** Catálogo público de áreas para registro (sin auth: Firestore `folders/` no es legible antes del login). */
export async function listAssignableRootAreasHandler(_req: Request, res: Response): Promise<void> {
  try {
    const areas = await listAssignableRootAreas()
    res.json({ areas })
  } catch (err) {
    logError('listAssignableRootAreasHandler falló', err)
    res.status(500).json({ error: 'No se pudieron cargar las áreas' })
  }
}
