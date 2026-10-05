import { Router } from 'express'
import { requireFinanzasPermiso, requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { enriquecerContrapartes } from '../../contraparte/services/enriquecer-contrapartes.js'
import {
  MovimientoAnotacionError,
  MovimientosSyncEnCursoError,
  actualizarAnotacionMovimiento,
  listMovimientosApi,
  syncMovimientosBancarios,
} from '../services/movimientos.service.js'

export const finanzasMovimientosRouter = Router()

finanzasMovimientosRouter.use(requireWorkspaceUser, requireViewFinanzas)

finanzasMovimientosRouter.get('/', async (req, res) => {
  try {
    const one = (value: unknown) => (typeof value === 'string' ? value : undefined)
    const result = await listMovimientosApi({
      cuentaId: one(req.query.cuentaId),
      desde: one(req.query.desde),
      hasta: one(req.query.hasta),
      tipo: one(req.query.tipo),
      categoriaId: one(req.query.categoriaId),
      q: one(req.query.q),
      page: one(req.query.page),
      limit: one(req.query.limit),
    })
    res.json(result)
  } catch (err) {
    console.error('[finanzas/movimientos] listar', err)
    const message = err instanceof Error ? err.message : 'No se pudieron listar los movimientos'
    res.status(400).json({ error: message })
  }
})

finanzasMovimientosRouter.post('/contrapartes/completar', requireFinanzasPermiso('finanzas_categorias'), async (_req, res) => {
  try {
    const resultado = await enriquecerContrapartes()
    res.json(resultado)
  } catch (err) {
    console.error('[finanzas/movimientos] completar contrapartes', err)
    const message = err instanceof Error ? err.message : 'No se pudieron completar las contrapartes'
    res.status(500).json({ error: message })
  }
})

finanzasMovimientosRouter.patch('/:id', requireFinanzasPermiso('finanzas_categorias'), async (req, res) => {
  try {
    const id = req.params.id
    if (!id || Array.isArray(id)) {
      res.status(400).json({ error: 'Id de movimiento inválido' })
      return
    }
    const body = (req.body ?? {}) as {
      categoriaId?: unknown
      nota?: unknown
      contraparteNombre?: unknown
      contraparteCuit?: unknown
      detalleCaja?: unknown
      aplicarAlMismoTexto?: unknown
    }
    const input: {
      movimientoId: string
      categoriaId?: string | null
      nota?: string | null
      contraparteNombre?: string | null
      contraparteCuit?: string | null
      detalleCaja?: string | null
      aplicarAlMismoTexto?: boolean
      actorUid?: string
    } = {
      movimientoId: id,
      actorUid: req.authedUser?.uid ?? '',
    }
    if (Object.prototype.hasOwnProperty.call(body, 'categoriaId')) {
      if (body.categoriaId == null || body.categoriaId === '') input.categoriaId = null
      else if (typeof body.categoriaId === 'string') input.categoriaId = body.categoriaId
      else {
        res.status(400).json({ error: 'categoriaId inválido' })
        return
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'nota')) {
      if (body.nota == null) input.nota = null
      else if (typeof body.nota === 'string') input.nota = body.nota
      else {
        res.status(400).json({ error: 'La nota tiene que ser texto' })
        return
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'contraparteNombre')) {
      if (body.contraparteNombre == null) input.contraparteNombre = null
      else if (typeof body.contraparteNombre === 'string') input.contraparteNombre = body.contraparteNombre
      else {
        res.status(400).json({ error: 'El nombre tiene que ser texto' })
        return
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'contraparteCuit')) {
      if (body.contraparteCuit == null) input.contraparteCuit = null
      else if (typeof body.contraparteCuit === 'string') input.contraparteCuit = body.contraparteCuit
      else {
        res.status(400).json({ error: 'El CUIT tiene que ser texto' })
        return
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'detalleCaja')) {
      if (body.detalleCaja == null) input.detalleCaja = null
      else if (typeof body.detalleCaja === 'string') input.detalleCaja = body.detalleCaja
      else {
        res.status(400).json({ error: 'El detalle tiene que ser texto' })
        return
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'aplicarAlMismoTexto')) {
      if (typeof body.aplicarAlMismoTexto !== 'boolean') {
        res.status(400).json({ error: 'aplicarAlMismoTexto tiene que ser sí o no' })
        return
      }
      input.aplicarAlMismoTexto = body.aplicarAlMismoTexto
    }
    const movimiento = await actualizarAnotacionMovimiento(input)
    res.json({ movimiento })
  } catch (err) {
    console.error('[finanzas/movimientos] anotar', err)
    if (err instanceof MovimientoAnotacionError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    const message = err instanceof Error ? err.message : 'No se pudo actualizar el movimiento'
    res.status(400).json({ error: message })
  }
})

finanzasMovimientosRouter.post('/sync', async (req, res) => {
  const actorUid = req.authedUser?.uid
  if (!actorUid) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  try {
    const result = await syncMovimientosBancarios({ actorUid })
    res.json(result)
  } catch (err) {
    if (err instanceof MovimientosSyncEnCursoError) {
      res.status(409).json({ error: err.message, enCurso: true })
      return
    }
    console.error('[finanzas/movimientos] sync', err)
    const message = err instanceof Error ? err.message : 'No se pudieron sincronizar los movimientos'
    res.status(502).json({ error: message })
  }
})
