import { Router } from 'express'
import { requireFinanzasPermiso, requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import type { OperacionDolaresInput } from '../domain/operacion-dolares.types.js'
import {
  crearOperacionDolares,
  actualizarOperacionDolares,
  anularOperacionDolares,
  obtenerOperacionDolares,
  listarOperacionesDolares,
} from '../services/operaciones-dolares.repository.js'

export const finanzasOperacionesDolaresRouter = Router()
finanzasOperacionesDolaresRouter.use(requireWorkspaceUser, requireViewFinanzas)

function parsearInput(body: Record<string, unknown>): OperacionDolaresInput {
  const cheques = Array.isArray(body.cheques)
    ? body.cheques.map((ch: Record<string, unknown>) => ({
        numeroCheque: String(ch.numeroCheque ?? ''),
        fechaCobro: String(ch.fechaCobro ?? ''),
        importeCentavos: Number(ch.importeCentavos) || 0,
      }))
    : []

  return {
    fecha: String(body.fecha ?? ''),
    inversor: String(body.inversor ?? ''),
    cotizacion: Number(body.cotizacion) || 0,
    tasaMensual: Number(body.tasaMensual) || 0,
    impuestoPorcentaje: Number(body.impuestoPorcentaje) || 0,
    montoUsd: Number(body.montoUsd) || 0,
    cashCentavos: Number(body.cashCentavos) || 0,
    notas: String(body.notas ?? ''),
    cheques,
  }
}

finanzasOperacionesDolaresRouter.get('/', async (_req, res) => {
  try {
    const operaciones = await listarOperacionesDolares()
    res.json({ operaciones })
  } catch (err) {
    console.error('[finanzas/operaciones-dolares] listar', err)
    res.status(500).json({ error: 'No se pudieron listar las operaciones' })
  }
})

finanzasOperacionesDolaresRouter.get('/:id', async (req, res) => {
  try {
    const op = await obtenerOperacionDolares(req.params.id)
    if (!op) {
      res.status(404).json({ error: 'Operación no encontrada' })
      return
    }
    res.json({ operacion: op })
  } catch (err) {
    console.error('[finanzas/operaciones-dolares] obtener', err)
    res.status(500).json({ error: 'No se pudo obtener la operación' })
  }
})

finanzasOperacionesDolaresRouter.post('/', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
  const actor = req.authedUser?.uid
  if (!actor) { res.status(401).json({ error: 'No autenticado' }); return }

  try {
    const input = parsearInput(req.body as Record<string, unknown>)
    const resultado = await crearOperacionDolares(input, actor)
    if (!resultado.ok) {
      res.status(400).json({ error: 'Datos inválidos', errores: (resultado as { errores: unknown[] }).errores })
      return
    }
    res.status(201).json({ operacion: resultado.operacion })
  } catch (err) {
    console.error('[finanzas/operaciones-dolares] crear', err)
    res.status(500).json({ error: 'No se pudo crear la operación' })
  }
})

finanzasOperacionesDolaresRouter.put('/:id', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
  const actor = req.authedUser?.uid
  if (!actor) { res.status(401).json({ error: 'No autenticado' }); return }

  try {
    const input = parsearInput(req.body as Record<string, unknown>)
    const resultado = await actualizarOperacionDolares(req.params.id, input, actor)
    if (!resultado.ok) {
      const msg = 'error' in resultado ? resultado.error : 'Datos inválidos'
      const errores = 'errores' in resultado ? resultado.errores : undefined
      res.status(400).json({ error: msg, errores })
      return
    }
    res.json({ operacion: resultado.operacion })
  } catch (err) {
    console.error('[finanzas/operaciones-dolares] actualizar', err)
    res.status(500).json({ error: 'No se pudo actualizar la operación' })
  }
})

finanzasOperacionesDolaresRouter.post('/:id/anular', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
  const actor = req.authedUser?.uid
  if (!actor) { res.status(401).json({ error: 'No autenticado' }); return }

  try {
    const resultado = await anularOperacionDolares(req.params.id, actor)
    if (!resultado.ok) {
      res.status(400).json({ error: resultado.error })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[finanzas/operaciones-dolares] anular', err)
    res.status(500).json({ error: 'No se pudo anular la operación' })
  }
})
