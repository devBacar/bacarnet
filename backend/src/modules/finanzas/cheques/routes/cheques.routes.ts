import { Router } from 'express'
import type { ChequeDireccion, ChequeEstado } from '../domain/cheque.types.js'
import { normalizeChequeDireccion } from '../domain/cheque.types.js'
import { ChequeTransitionError } from '../domain/cheque.transitions.js'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { parseDateInput } from '../services/cheques.repository.js'
import {
  anularChequeEmitido,
  createCheque,
  debitarChequeEmitido,
  depositarCheque,
  endosarCheque,
  entregarChequeEmitido,
  getChequeDetail,
  getChequeHistorial,
  listCheques,
  rechazarCheque,
  venderCheque,
} from '../services/cheques.service.js'
import { listCobrosEsperados, listCompromisosPendientes } from '../services/agenda.repository.js'
import { createCobroAgenda } from '../../agenda/services/cobros.service.js'
import { createCompromisoAgenda } from '../../agenda/services/compromisos.service.js'

export const finanzasChequesRouter = Router()

finanzasChequesRouter.use(requireWorkspaceUser, requireViewFinanzas)

finanzasChequesRouter.get('/', async (req, res) => {
  try {
    const estado = typeof req.query.estado === 'string' ? (req.query.estado as ChequeEstado) : undefined
    const bancoEmisor = typeof req.query.banco === 'string' ? req.query.banco : undefined
    const fechaPagoDesde = parseDateInput(req.query.fechaPagoDesde)
    const fechaPagoHasta = parseDateInput(req.query.fechaPagoHasta)
    const direccionRaw = typeof req.query.direccion === 'string' ? req.query.direccion : undefined
    const direccion: ChequeDireccion | undefined = direccionRaw
      ? normalizeChequeDireccion(direccionRaw)
      : undefined
    const cheques = await listCheques({ estado, bancoEmisor, fechaPagoDesde, fechaPagoHasta, direccion })
    res.json({ cheques })
  } catch (err) {
    console.error('[finanzas/cheques] list', err)
    res.status(500).json({ error: 'No se pudieron listar los cheques' })
  }
})

finanzasChequesRouter.get('/agenda/compromisos', async (_req, res) => {
  try {
    const compromisos = await listCompromisosPendientes()
    res.json({ compromisos })
  } catch (err) {
    console.error('[finanzas/cheques] compromisos', err)
    res.status(500).json({ error: 'No se pudieron listar compromisos' })
  }
})

finanzasChequesRouter.get('/agenda/cobros', async (_req, res) => {
  try {
    const cobros = await listCobrosEsperados()
    res.json({ cobros })
  } catch (err) {
    console.error('[finanzas/cheques] cobros', err)
    res.status(500).json({ error: 'No se pudieron listar cobros' })
  }
})

finanzasChequesRouter.post('/agenda/compromisos', async (req, res) => {
  try {
    const compromiso = await createCompromisoAgenda({
      actorUid: req.authedUser!.uid,
      body: { ...(req.body as Record<string, unknown>), medioPago: 'cheque' },
    })
    res.status(201).json({ id: compromiso.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo crear el compromiso'
    res.status(400).json({ error: message })
  }
})

finanzasChequesRouter.post('/agenda/cobros', async (req, res) => {
  try {
    const cobro = await createCobroAgenda({
      actorUid: req.authedUser!.uid,
      body: req.body as Record<string, unknown>,
    })
    res.status(201).json({ id: cobro.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo crear el cobro esperado'
    res.status(400).json({ error: message })
  }
})

finanzasChequesRouter.post('/', async (req, res) => {
  try {
    const uid = req.authedUser!.uid
    const cheque = await createCheque({ actorUid: uid, body: req.body as Record<string, unknown> })
    res.status(201).json({ cheque })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al crear cheque'
    console.error('[finanzas/cheques] create', err)
    res.status(400).json({ error: message })
  }
})

finanzasChequesRouter.get('/:id/historial', async (req, res) => {
  try {
    const historial = await getChequeHistorial(req.params.id)
    if (!historial) {
      res.status(404).json({ error: 'Cheque no encontrado' })
      return
    }
    res.json({ historial })
  } catch (err) {
    console.error('[finanzas/cheques] historial', err)
    res.status(500).json({ error: 'No se pudo cargar el historial' })
  }
})

finanzasChequesRouter.get('/:id', async (req, res) => {
  try {
    const cheque = await getChequeDetail(req.params.id)
    if (!cheque) {
      res.status(404).json({ error: 'Cheque no encontrado' })
      return
    }
    res.json({ cheque })
  } catch (err) {
    console.error('[finanzas/cheques] get', err)
    res.status(500).json({ error: 'No se pudo cargar el cheque' })
  }
})

async function runAction(
  req: { params: { id: string }; authedUser?: { uid: string }; body: unknown },
  res: { status: (n: number) => { json: (b: unknown) => void } },
  handler: () => Promise<unknown>,
) {
  try {
    const cheque = await handler()
    res.status(200).json({ cheque })
  } catch (err) {
    if (err instanceof ChequeTransitionError) {
      res.status(409).json({ error: err.message })
      return
    }
    const message = err instanceof Error ? err.message : 'No se pudo aplicar la acción'
    console.error('[finanzas/cheques] action', err)
    res.status(400).json({ error: message })
  }
}

finanzasChequesRouter.post('/:id/depositar', async (req, res) => {
  const uid = req.authedUser!.uid
  const nota = typeof (req.body as Record<string, unknown>).nota === 'string'
    ? ((req.body as Record<string, unknown>).nota as string)
    : null
  await runAction(req, res, () => depositarCheque(req.params.id, uid, nota))
})

finanzasChequesRouter.post('/:id/endosar', async (req, res) => {
  const uid = req.authedUser!.uid
  await runAction(req, res, () =>
    endosarCheque(req.params.id, uid, req.body as Record<string, unknown>),
  )
})

finanzasChequesRouter.post('/:id/vender', async (req, res) => {
  const uid = req.authedUser!.uid
  await runAction(req, res, () =>
    venderCheque(req.params.id, uid, req.body as Record<string, unknown>),
  )
})

finanzasChequesRouter.post('/:id/rechazar', async (req, res) => {
  const uid = req.authedUser!.uid
  await runAction(req, res, () =>
    rechazarCheque(req.params.id, uid, req.body as Record<string, unknown>),
  )
})

finanzasChequesRouter.post('/:id/entregar', async (req, res) => {
  const uid = req.authedUser!.uid
  const nota = typeof (req.body as Record<string, unknown>).nota === 'string'
    ? ((req.body as Record<string, unknown>).nota as string)
    : null
  await runAction(req, res, () => entregarChequeEmitido(req.params.id, uid, nota))
})

finanzasChequesRouter.post('/:id/debitar', async (req, res) => {
  const uid = req.authedUser!.uid
  const nota = typeof (req.body as Record<string, unknown>).nota === 'string'
    ? ((req.body as Record<string, unknown>).nota as string)
    : null
  await runAction(req, res, () => debitarChequeEmitido(req.params.id, uid, nota))
})

finanzasChequesRouter.post('/:id/anular', async (req, res) => {
  const uid = req.authedUser!.uid
  const nota = typeof (req.body as Record<string, unknown>).nota === 'string'
    ? ((req.body as Record<string, unknown>).nota as string)
    : null
  await runAction(req, res, () => anularChequeEmitido(req.params.id, uid, nota))
})
