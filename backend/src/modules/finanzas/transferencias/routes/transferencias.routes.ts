import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import {
  confeccionarTransferenciaDesdeCompromiso,
  getTransferenciaEstadoApi,
} from '../services/transferencias.service.js'

export const finanzasTransferenciasRouter = Router()

finanzasTransferenciasRouter.use(requireWorkspaceUser, requireViewFinanzas)

finanzasTransferenciasRouter.post('/confeccionar', async (req, res) => {
  try {
    const result = await confeccionarTransferenciaDesdeCompromiso({
      actorUid: req.authedUser!.uid,
      body: req.body as Record<string, unknown>,
    })
    if (!result.ok) {
      res.status(422).json({
        error: result.errores[0] ?? 'No se pudo confeccionar la transferencia',
        errores: result.errores,
        transferencia: result.transferencia,
      })
      return
    }
    res.status(201).json(result)
  } catch (err) {
    console.error('[finanzas/transferencias] confeccionar', err)
    const message = err instanceof Error ? err.message : 'No se pudo confeccionar la transferencia'
    res.status(400).json({ error: message })
  }
})

finanzasTransferenciasRouter.get('/:id/estado', async (req, res) => {
  try {
    const transferencia = await getTransferenciaEstadoApi(req.params.id)
    if (!transferencia) {
      res.status(404).json({ error: 'Transferencia no encontrada' })
      return
    }
    res.json({ transferencia })
  } catch (err) {
    console.error('[finanzas/transferencias] estado', err)
    res.status(500).json({ error: 'No se pudo consultar el estado' })
  }
})
