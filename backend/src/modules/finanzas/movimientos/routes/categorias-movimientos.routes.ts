import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import {
  crearCategoriaMovimientoApi,
  listCategoriasMovimientosApi,
} from '../services/categorias-movimientos.service.js'

export const finanzasCategoriasMovimientosRouter = Router()

finanzasCategoriasMovimientosRouter.use(requireWorkspaceUser, requireViewFinanzas)

finanzasCategoriasMovimientosRouter.get('/', async (_req, res) => {
  try {
    const categorias = await listCategoriasMovimientosApi()
    res.json({ categorias })
  } catch (err) {
    console.error('[finanzas/categorias-movimientos] listar', err)
    const message = err instanceof Error ? err.message : 'No se pudieron listar las categorías'
    res.status(400).json({ error: message })
  }
})

finanzasCategoriasMovimientosRouter.post('/', async (req, res) => {
  const actorUid = req.authedUser?.uid
  if (!actorUid) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  try {
    const result = await crearCategoriaMovimientoApi({
      actorUid,
      body: (req.body ?? {}) as Record<string, unknown>,
    })
    res.status(result.creada ? 201 : 200).json(result)
  } catch (err) {
    console.error('[finanzas/categorias-movimientos] crear', err)
    const message = err instanceof Error ? err.message : 'No se pudo crear la categoría'
    res.status(400).json({ error: message })
  }
})
