import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { CajaDiaError, getCajaDia, listarDetallesCaja } from '../services/caja-dia.service.js'

/**
 * Montado en `/api/finanzas/caja-dia`.
 * GET /?fecha=YYYY-MM-DD arma la planilla. GET /detalles lista las palabras.
 */
export const finanzasCajaDiaRouter = Router()

finanzasCajaDiaRouter.use(requireWorkspaceUser, requireViewFinanzas)

finanzasCajaDiaRouter.get('/detalles', async (_req, res) => {
  try {
    const lista = await listarDetallesCaja()
    res.json(lista)
  } catch (err) {
    console.error('[finanzas/caja-dia] detalles', err)
    res.status(500).json({ error: 'No se pudieron listar los detalles' })
  }
})

finanzasCajaDiaRouter.get('/', async (req, res) => {
  const fecha = typeof req.query.fecha === 'string' ? req.query.fecha : undefined
  try {
    const caja = await getCajaDia({ fecha })
    res.json(caja)
  } catch (err) {
    if (err instanceof CajaDiaError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    console.error('[finanzas/caja-dia]', err)
    res.status(500).json({ error: 'No se pudo armar la caja del día' })
  }
})
