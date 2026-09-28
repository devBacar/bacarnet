import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import {
  CategoriaMovimientoError,
  crearCategoriaMovimientoApi,
  eliminarCategoriaMovimientoApi,
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

finanzasCategoriasMovimientosRouter.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id
    if (!id || Array.isArray(id)) {
      res.status(400).json({ error: 'Id de categoría inválido' })
      return
    }
    const result = await eliminarCategoriaMovimientoApi({ categoriaId: id })
    res.json(result)
  } catch (err) {
    console.error('[finanzas/categorias-movimientos] eliminar', err)
    if (err instanceof CategoriaMovimientoError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    const message = err instanceof Error ? err.message : 'No se pudo eliminar la categoría'
    res.status(400).json({ error: message })
  }
})
