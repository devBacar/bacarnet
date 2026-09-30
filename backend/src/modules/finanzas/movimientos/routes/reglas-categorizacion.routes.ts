import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import {
  ReglaCategorizacionError,
  aplicarReglasAMovimientosSinCategoria,
  crearReglaCategorizacion,
  listReglasCategorizacionApi,
} from '../services/reglas-categorizacion.service.js'

export const finanzasReglasCategorizacionRouter = Router()

finanzasReglasCategorizacionRouter.use(requireWorkspaceUser, requireViewFinanzas)

finanzasReglasCategorizacionRouter.get('/', async (_req, res) => {
  try {
    const reglas = await listReglasCategorizacionApi()
    res.json({ reglas })
  } catch (err) {
    console.error('[finanzas/reglas-categorizacion] listar', err)
    const message = err instanceof Error ? err.message : 'No se pudieron listar las reglas'
    res.status(400).json({ error: message })
  }
})

/** Crea la regla y categoriza los movimientos que todavía no tienen categoría y matchean. */
finanzasReglasCategorizacionRouter.post('/', async (req, res) => {
  const actorUid = req.authedUser?.uid
  if (!actorUid) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  try {
    const result = await crearReglaCategorizacion({
      actorUid,
      body: (req.body ?? {}) as Record<string, unknown>,
    })
    res.status(result.creada ? 201 : 200).json(result)
  } catch (err) {
    console.error('[finanzas/reglas-categorizacion] crear', err)
    if (err instanceof ReglaCategorizacionError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    const message = err instanceof Error ? err.message : 'No se pudo crear la regla'
    res.status(400).json({ error: message })
  }
})

finanzasReglasCategorizacionRouter.post('/aplicar', async (_req, res) => {
  try {
    const { revisados, categorizados, porCategoria } = await aplicarReglasAMovimientosSinCategoria()
    res.json({ revisados, categorizados, porCategoria })
  } catch (err) {
    console.error('[finanzas/reglas-categorizacion] aplicar', err)
    const message = err instanceof Error ? err.message : 'No se pudieron aplicar las reglas'
    res.status(400).json({ error: message })
  }
})
