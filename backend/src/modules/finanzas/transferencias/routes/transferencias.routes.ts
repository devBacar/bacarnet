import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import {
  ReconciliacionError,
  confirmarMovimientoDeTransferencia,
} from '../services/reconciliar-movimientos.js'
import {
  TransferenciaCancelacionError,
  cancelarTransferenciaConfeccionada,
  confeccionarTransferenciaDesdeCompromiso,
  getTransferenciaEstadoApi,
  getTransferenciaHistorialApi,
  listTransferenciasApi,
} from '../services/transferencias.service.js'

export const finanzasTransferenciasRouter = Router()

finanzasTransferenciasRouter.use(requireWorkspaceUser, requireViewFinanzas)

finanzasTransferenciasRouter.get('/', async (req, res) => {
  try {
    const query = req.query
    const one = (value: unknown) => (typeof value === 'string' ? value : undefined)
    const result = await listTransferenciasApi({
      estado: one(query.estado),
      cuentaId: one(query.cuentaId),
      tipo: one(query.tipo),
      desde: one(query.desde),
      hasta: one(query.hasta),
    })
    res.json(result)
  } catch (err) {
    console.error('[finanzas/transferencias] listar', err)
    const message = err instanceof Error ? err.message : 'No se pudo listar las transferencias'
    res.status(400).json({ error: message })
  }
})

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

finanzasTransferenciasRouter.post('/:id/confirmar-movimiento', async (req, res) => {
  try {
    const id = req.params.id
    if (!id || Array.isArray(id)) {
      res.status(400).json({ error: 'Id de transferencia inválido' })
      return
    }
    const movimientoId = (req.body as { movimientoId?: unknown })?.movimientoId
    if (typeof movimientoId !== 'string' || !movimientoId.trim()) {
      res.status(400).json({ error: 'Elegí el movimiento que corresponde' })
      return
    }
    const result = await confirmarMovimientoDeTransferencia({
      actorUid: req.authedUser!.uid,
      transferenciaId: id,
      movimientoId,
    })
    res.json({
      transferencia: {
        id: result.id,
        estado: result.data.estado,
        movimientoId: result.data.movimientoId ?? null,
        compromisoPagoId: result.data.compromisoPagoId,
      },
    })
  } catch (err) {
    console.error('[finanzas/transferencias] confirmar-movimiento', err)
    if (err instanceof ReconciliacionError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    const message = err instanceof Error ? err.message : 'No se pudo confirmar el movimiento'
    res.status(400).json({ error: message })
  }
})

finanzasTransferenciasRouter.post('/:id/cancelar', async (req, res) => {
  try {
    const id = req.params.id
    if (!id || Array.isArray(id)) {
      res.status(400).json({ error: 'Id de transferencia inválido' })
      return
    }
    const result = await cancelarTransferenciaConfeccionada({
      actorUid: req.authedUser!.uid,
      transferenciaId: id,
    })
    res.json(result)
  } catch (err) {
    console.error('[finanzas/transferencias] cancelar', err)
    if (err instanceof TransferenciaCancelacionError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    const message = err instanceof Error ? err.message : 'No se pudo cancelar la transferencia'
    res.status(400).json({ error: message })
  }
})

finanzasTransferenciasRouter.get('/:id/historial', async (req, res) => {
  try {
    const id = req.params.id
    if (!id || Array.isArray(id)) {
      res.status(400).json({ error: 'Id de transferencia inválido' })
      return
    }
    const historial = await getTransferenciaHistorialApi(id)
    if (!historial) {
      res.status(404).json({ error: 'Transferencia no encontrada' })
      return
    }
    res.json({ historial })
  } catch (err) {
    console.error('[finanzas/transferencias] historial', err)
    res.status(500).json({ error: 'No se pudo leer el historial' })
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
