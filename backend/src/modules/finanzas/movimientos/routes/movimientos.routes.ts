import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { syncMovimientosBancarios, listMovimientosApi } from '../services/movimientos.service.js'

export const finanzasMovimientosRouter = Router()

finanzasMovimientosRouter.use(requireWorkspaceUser, requireViewFinanzas)

finanzasMovimientosRouter.get('/', async (req, res) => {
  try {
    const one = (value: unknown) => (typeof value === 'string' ? value : undefined)
    const result = await listMovimientosApi({
      cuentaId: one(req.query.cuentaId),
      desde: one(req.query.desde),
      hasta: one(req.query.hasta),
      tipo: one(req.query.tipo),
      q: one(req.query.q),
      page: one(req.query.page),
      limit: one(req.query.limit),
    })
    res.json(result)
  } catch (err) {
    console.error('[finanzas/movimientos] listar', err)
    const message = err instanceof Error ? err.message : 'No se pudieron listar los movimientos'
    res.status(400).json({ error: message })
  }
})

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
