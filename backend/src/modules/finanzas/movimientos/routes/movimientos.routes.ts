import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { syncMovimientosBancarios } from '../services/movimientos.service.js'

export const finanzasMovimientosRouter = Router()

finanzasMovimientosRouter.use(requireWorkspaceUser, requireViewFinanzas)

finanzasMovimientosRouter.post('/sync', async (req, res) => {
  const actorUid = req.authedUser?.uid
  if (!actorUid) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  try {
    const result = await syncMovimientosBancarios({ actorUid })
    res.json(result)
  } catch (err) {
    console.error('[finanzas/movimientos] sync', err)
    const message = err instanceof Error ? err.message : 'No se pudieron sincronizar los movimientos'
    res.status(502).json({ error: message })
  }
})
