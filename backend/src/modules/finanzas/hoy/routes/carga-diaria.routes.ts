import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { CargaDiariaError, getCargaDiaria } from '../services/carga-diaria.service.js'

/**
 * Montado en `/api/finanzas/carga-diaria`.
 * GET /?desde=AAAA-MM-DD&dias=30 devuelve cuánto hay que pagar cada día y si es liviano, medio o pesado.
 */
export const finanzasCargaDiariaRouter = Router()

finanzasCargaDiariaRouter.use(requireWorkspaceUser, requireViewFinanzas)

finanzasCargaDiariaRouter.get('/', async (req, res) => {
  const desde = typeof req.query.desde === 'string' ? req.query.desde : undefined
  const dias = typeof req.query.dias === 'string' ? Number(req.query.dias) : undefined
  try {
    res.json(await getCargaDiaria({ desde, dias }))
  } catch (err) {
    if (err instanceof CargaDiariaError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    console.error('[finanzas/carga-diaria]', err)
    res.status(500).json({ error: 'No se pudo calcular la carga de pagos' })
  }
})
