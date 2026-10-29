import { Router } from 'express'
import { logError } from '../../../lib/log.js'
import { requireWorkspaceUser } from '../../auth/middleware.js'
import { CopsServiceError, obtenerSnapshotCops } from '../services/cops.service.js'

/**
 * Montado en /api/cops. Proxy al snapshot externo: la API key nunca sale al cliente.
 */
export const copsRouter = Router()

copsRouter.use(requireWorkspaceUser)

copsRouter.get('/snapshot', async (_req, res) => {
  try {
    res.json(await obtenerSnapshotCops())
  } catch (err) {
    if (err instanceof CopsServiceError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    logError('[cops] no se pudo obtener el snapshot', err)
    res.status(503).json({ error: 'Datos aún no disponibles, reintentando...' })
  }
})
