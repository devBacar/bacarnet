import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { CompromisoMesError, crearCompromisoMes, editarCompromisoMes, getPlanillaCompromisosMes, guardarTipoCambioMes, leerTipoCambioMes } from '../services/compromisos-mes.service.js'

/**
 * No está montado. Hay que colgarlo en `/api/finanzas/compromisos-mes`.
 * GET /?mes=AAAA-MM arma la planilla. PUT /tipo-cambio guarda el dólar del mes.
 */
export const finanzasCompromisosMesRouter = Router()

finanzasCompromisosMesRouter.use(requireWorkspaceUser, requireViewFinanzas)

function mensajeDe(err: unknown, fallback: string): { status: number; error: string } {
  if (err instanceof CompromisoMesError) return { status: err.status, error: err.message }
  const error = err instanceof Error && err.message ? err.message : fallback
  const status = /no encontr/i.test(error) ? 404 : 400
  return { status, error }
}

finanzasCompromisosMesRouter.get('/tipo-cambio', async (req, res) => {
  const mes = typeof req.query.mes === 'string' ? req.query.mes : ''
  try {
    const tipo = await leerTipoCambioMes(mes)
    res.json(tipo)
  } catch (err) {
    const { status, error } = mensajeDe(err, 'No se pudo leer el tipo de cambio')
    if (status >= 500) console.error('[finanzas/compromisos-mes] tipo de cambio', err)
    res.status(status).json({ error })
  }
})

finanzasCompromisosMesRouter.put('/tipo-cambio', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const mes = typeof body.mes === 'string' ? body.mes : ''
  try {
    const tipo = await guardarTipoCambioMes({
      mes,
      usdArs: body.usdArs,
      actorUid: req.authedUser!.uid,
    })
    res.json(tipo)
  } catch (err) {
    const { status, error } = mensajeDe(err, 'No se pudo guardar el tipo de cambio')
    res.status(status).json({ error })
  }
})

finanzasCompromisosMesRouter.post('/compromisos', async (req, res) => {
  try {
    const compromiso = await crearCompromisoMes({
      actorUid: req.authedUser!.uid,
      body: (req.body ?? {}) as Record<string, unknown>,
    })
    res.status(201).json({ compromiso })
  } catch (err) {
    const { status, error } = mensajeDe(err, 'No se pudo crear el compromiso')
    res.status(status).json({ error })
  }
})

finanzasCompromisosMesRouter.patch('/compromisos/:id', async (req, res) => {
  try {
    const compromiso = await editarCompromisoMes({
      compromisoId: req.params.id,
      actorUid: req.authedUser!.uid,
      body: (req.body ?? {}) as Record<string, unknown>,
    })
    res.json({ compromiso })
  } catch (err) {
    const { status, error } = mensajeDe(err, 'No se pudo editar el compromiso')
    res.status(status).json({ error })
  }
})

finanzasCompromisosMesRouter.get('/', async (req, res) => {
  const mes = typeof req.query.mes === 'string' ? req.query.mes : ''
  try {
    const planilla = await getPlanillaCompromisosMes(mes)
    res.json(planilla)
  } catch (err) {
    if (err instanceof CompromisoMesError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    console.error('[finanzas/compromisos-mes]', err)
    res.status(500).json({ error: 'No se pudo armar la planilla' })
  }
})
