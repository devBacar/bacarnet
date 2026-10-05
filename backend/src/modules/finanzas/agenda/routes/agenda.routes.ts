import { Router } from 'express'
import { requireFinanzasPermiso, requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { parsePrioridadUrgencia } from '../domain/agenda.prioridad.js'
import {
  confirmarCobro,
  createCobroAgenda,
  getCobroHistorialApi,
  listCobrosAgenda,
  patchCobroUrgencia,
} from '../services/cobros.service.js'
import {
  createCompromisoAgenda,
  getCompromisoHistorialApi,
  listCompromisosAgenda,
  marcarCompromisoPagado,
  patchCompromisoAgenda,
  patchCompromisoUrgencia,
} from '../services/compromisos.service.js'
import { listarPagosHechos, PagosHechosError } from '../services/pagos-hechos.service.js'

export const finanzasAgendaRouter = Router()

finanzasAgendaRouter.use(requireWorkspaceUser, requireViewFinanzas)

finanzasAgendaRouter.get('/pagos-hechos', async (req, res) => {
  try {
    const data = await listarPagosHechos({
      mes: req.query.mes,
      desde: req.query.desde,
      hasta: req.query.hasta,
    })
    res.json(data)
  } catch (err) {
    if (err instanceof PagosHechosError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    console.error('[finanzas/agenda] pagos hechos', err)
    res.status(500).json({ error: 'No se pudieron listar los pagos hechos' })
  }
})

finanzasAgendaRouter.get('/compromisos', async (req, res) => {
  try {
    const vista = req.query.vista === 'pagados' ? 'pagados' : 'pendientes'
    const compromisos = await listCompromisosAgenda(vista)
    res.json({ compromisos })
  } catch (err) {
    console.error('[finanzas/agenda] list compromisos', err)
    res.status(500).json({ error: 'No se pudieron listar los compromisos' })
  }
})

finanzasAgendaRouter.post('/compromisos', requireFinanzasPermiso('finanzas_agenda'), async (req, res) => {
  try {
    const compromiso = await createCompromisoAgenda({
      actorUid: req.authedUser!.uid,
      body: req.body as Record<string, unknown>,
    })
    res.status(201).json({ compromiso })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al crear compromiso'
    res.status(400).json({ error: message })
  }
})

finanzasAgendaRouter.patch('/compromisos/:id', requireFinanzasPermiso('finanzas_agenda'), async (req, res) => {
  try {
    const compromiso = await patchCompromisoAgenda(
      req.params.id,
      req.authedUser!.uid,
      req.body as Record<string, unknown>,
    )
    res.json({ compromiso })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo editar el compromiso'
    const status = /no encontr/i.test(message) ? 404 : 400
    res.status(status).json({ error: message })
  }
})

finanzasAgendaRouter.get('/compromisos/:id/historial', async (req, res) => {
  try {
    const historial = await getCompromisoHistorialApi(req.params.id)
    if (!historial) {
      res.status(404).json({ error: 'Compromiso no encontrado' })
      return
    }
    res.json({ historial })
  } catch (err) {
    console.error('[finanzas/agenda] historial compromiso', err)
    res.status(500).json({ error: 'No se pudo cargar el historial' })
  }
})

finanzasAgendaRouter.patch('/compromisos/:id/prioridad', requireFinanzasPermiso('finanzas_agenda'), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    if (!('urgenciaManual' in body)) {
      res.status(400).json({ error: 'urgenciaManual requerida' })
      return
    }
    const urgenciaManual =
      body.urgenciaManual === null || body.urgenciaManual === ''
        ? null
        : parsePrioridadUrgencia(body.urgenciaManual)
    if (body.urgenciaManual !== null && body.urgenciaManual !== '' && urgenciaManual === null) {
      res.status(400).json({ error: 'urgenciaManual inválida' })
      return
    }
    const compromiso = await patchCompromisoUrgencia(req.params.id, urgenciaManual)
    res.json({ compromiso })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo actualizar urgencia'
    res.status(400).json({ error: message })
  }
})

finanzasAgendaRouter.post('/compromisos/:id/marcar-pagado', requireFinanzasPermiso('finanzas_agenda'), async (req, res) => {
  try {
    const compromiso = await marcarCompromisoPagado(
      req.params.id,
      req.authedUser!.uid,
      req.body as Record<string, unknown>,
    )
    res.json({ compromiso })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo marcar como pagado'
    res.status(400).json({ error: message })
  }
})

finanzasAgendaRouter.get('/cobros', async (req, res) => {
  try {
    const vista = req.query.vista === 'cobrados' ? 'cobrados' : 'esperados'
    const cobros = await listCobrosAgenda(vista)
    res.json({ cobros })
  } catch (err) {
    console.error('[finanzas/agenda] list cobros', err)
    res.status(500).json({ error: 'No se pudieron listar los cobros' })
  }
})

finanzasAgendaRouter.post('/cobros', requireFinanzasPermiso('finanzas_agenda'), async (req, res) => {
  try {
    const cobro = await createCobroAgenda({
      actorUid: req.authedUser!.uid,
      body: req.body as Record<string, unknown>,
    })
    res.status(201).json({ cobro })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al crear cobro'
    res.status(400).json({ error: message })
  }
})

finanzasAgendaRouter.get('/cobros/:id/historial', async (req, res) => {
  try {
    const historial = await getCobroHistorialApi(req.params.id)
    if (!historial) {
      res.status(404).json({ error: 'Cobro no encontrado' })
      return
    }
    res.json({ historial })
  } catch (err) {
    console.error('[finanzas/agenda] historial cobro', err)
    res.status(500).json({ error: 'No se pudo cargar el historial' })
  }
})

finanzasAgendaRouter.patch('/cobros/:id/prioridad', requireFinanzasPermiso('finanzas_agenda'), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    if (!('urgenciaManual' in body)) {
      res.status(400).json({ error: 'urgenciaManual requerida' })
      return
    }
    const urgenciaManual =
      body.urgenciaManual === null || body.urgenciaManual === ''
        ? null
        : parsePrioridadUrgencia(body.urgenciaManual)
    if (body.urgenciaManual !== null && body.urgenciaManual !== '' && urgenciaManual === null) {
      res.status(400).json({ error: 'urgenciaManual inválida' })
      return
    }
    const cobro = await patchCobroUrgencia(req.params.id, urgenciaManual)
    res.json({ cobro })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo actualizar urgencia'
    res.status(400).json({ error: message })
  }
})

finanzasAgendaRouter.post('/cobros/:id/confirmar', requireFinanzasPermiso('finanzas_agenda'), async (req, res) => {
  try {
    const cobro = await confirmarCobro(
      req.params.id,
      req.authedUser!.uid,
      req.body as Record<string, unknown>,
    )
    res.json({ cobro })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo confirmar el cobro'
    res.status(400).json({ error: message })
  }
})
