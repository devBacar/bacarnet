import { Router, type Response } from 'express'
import {
  requireFinanzasPermiso,
  requireViewFinanzas,
  requireWorkspaceUser,
} from '../../../auth/middleware.js'
import { ErrorValidacion } from '../domain/validar.js'
import {
  cambiarEstadoInversor,
  crearInversor,
  editarInversor,
  fichaInversor,
  guardarConfig,
  leerConfig,
  listarInversores,
  NoEncontrado,
} from '../services/inversores.service.js'

export const finanzasInversionesRouter = Router()

finanzasInversionesRouter.use(
  requireWorkspaceUser,
  requireViewFinanzas,
  requireFinanzasPermiso('finanzas_inversiones'),
)

function responderError(res: Response, err: unknown, fallback: string, contexto: string): void {
  if (err instanceof ErrorValidacion) {
    res.status(400).json({ error: err.message })
    return
  }
  if (err instanceof NoEncontrado) {
    res.status(404).json({ error: err.message })
    return
  }
  console.error(`[finanzas/inversiones] ${contexto}`, err)
  res.status(500).json({ error: fallback })
}

// Rutas fijas antes que '/:id' para que no se pisen.

finanzasInversionesRouter.get('/inversores', async (_req, res) => {
  try {
    res.json({ inversores: await listarInversores() })
  } catch (err) {
    responderError(res, err, 'No pude traer los inversores', 'listar inversores')
  }
})

finanzasInversionesRouter.post('/inversores', async (req, res) => {
  try {
    res.status(201).json(await crearInversor(req.body, req.authedUser!.uid))
  } catch (err) {
    responderError(res, err, 'No pude guardar el inversor', 'crear inversor')
  }
})

finanzasInversionesRouter.get('/inversores/:id', async (req, res) => {
  try {
    res.json(await fichaInversor(req.params.id))
  } catch (err) {
    responderError(res, err, 'No pude traer la ficha', 'ficha inversor')
  }
})

finanzasInversionesRouter.patch('/inversores/:id', async (req, res) => {
  try {
    res.json(await editarInversor(req.params.id, req.body, req.authedUser!.uid))
  } catch (err) {
    responderError(res, err, 'No pude guardar los cambios', 'editar inversor')
  }
})

finanzasInversionesRouter.post('/inversores/:id/estado', async (req, res) => {
  try {
    res.json(await cambiarEstadoInversor(req.params.id, req.body?.estado, req.authedUser!.uid))
  } catch (err) {
    responderError(res, err, 'No pude cambiar el estado', 'estado inversor')
  }
})

finanzasInversionesRouter.get('/config', async (_req, res) => {
  try {
    res.json(await leerConfig())
  } catch (err) {
    responderError(res, err, 'No pude traer la configuración', 'leer config')
  }
})

/** Solo el Líder de Finanzas cambia la configuración. */
finanzasInversionesRouter.put('/config', requireFinanzasPermiso('finanzas_inversiones_aprobar'), async (req, res) => {
  try {
    res.json(await guardarConfig(req.body, req.authedUser!.uid))
  } catch (err) {
    responderError(res, err, 'No pude guardar la configuración', 'guardar config')
  }
})
