import { Router, type Response } from 'express'
import {
  requireFinanzasPermiso,
  requireViewFinanzas,
  requireWorkspaceUser,
} from '../../../auth/middleware.js'
import { EnCurso, ErrorValidacion, NoEncontrado } from '../domain/validar.js'
import {
  cambiarEstadoInversor,
  crearInversor,
  editarInversor,
  fichaInversor,
  guardarConfig,
  leerConfig,
  listarInversores,
} from '../services/inversores.service.js'
import {
  anularInversion,
  aprobarInversion,
  crearInversion,
  cuotaEnPesos,
  detalleInversion,
  editarInversion,
  enviarAAprobacion,
  listarInversiones,
  rechazarInversion,
  registrarIngreso,
  simular,
} from '../services/inversiones.service.js'
import { confirmar, vistaPrevia } from '../services/importar-planilla.service.js'
import { parseMultipartUpload } from '../../../drive/parseMultipartUpload.js'

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
  if (err instanceof EnCurso) {
    res.status(409).json({ error: err.message })
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

finanzasInversionesRouter.post('/simular', async (req, res) => {
  try {
    res.json(await simular(req.body))
  } catch (err) {
    responderError(res, err, 'No pude calcular las cuotas', 'simular')
  }
})

// Importar la planilla de compromisos (inversores en curso). Crea todo "Para aprobar".
finanzasInversionesRouter.post('/importar/vista-previa', async (req, res) => {
  try {
    const { file, fields } = await parseMultipartUpload(req)
    if (!file) throw new ErrorValidacion('Elegí el archivo de la planilla.')
    res.json(await vistaPrevia(file.buffer, fields.hoja?.trim() || null, req.authedUser!))
  } catch (err) {
    responderError(res, err, 'No pude leer la planilla', 'importar vista previa')
  }
})

finanzasInversionesRouter.post('/importar/confirmar', async (req, res) => {
  try {
    res.json(await confirmar(req.body?.token, req.body?.filas, req.authedUser!))
  } catch (err) {
    responderError(res, err, 'No pude importar', 'importar confirmar')
  }
})

// ── Inversiones (después de las rutas fijas) ──────────────────

finanzasInversionesRouter.get('/', async (_req, res) => {
  try {
    res.json(await listarInversiones())
  } catch (err) {
    responderError(res, err, 'No pude traer las inversiones', 'listar')
  }
})

finanzasInversionesRouter.post('/', async (req, res) => {
  try {
    res.status(201).json(await crearInversion(req.body, req.authedUser!))
  } catch (err) {
    responderError(res, err, 'No pude guardar la inversión', 'crear')
  }
})

finanzasInversionesRouter.get('/:id', async (req, res) => {
  try {
    res.json(await detalleInversion(req.params.id, req.authedUser!))
  } catch (err) {
    responderError(res, err, 'No pude traer la inversión', 'detalle')
  }
})

finanzasInversionesRouter.patch('/:id', async (req, res) => {
  try {
    res.json(await editarInversion(req.params.id, req.body, req.authedUser!))
  } catch (err) {
    responderError(res, err, 'No pude guardar los cambios', 'editar')
  }
})

finanzasInversionesRouter.post('/:id/enviar', async (req, res) => {
  try {
    res.json(await enviarAAprobacion(req.params.id, req.body?.nota, req.authedUser!))
  } catch (err) {
    responderError(res, err, 'No pude enviarla a aprobación', 'enviar')
  }
})

finanzasInversionesRouter.post('/:id/aprobar', requireFinanzasPermiso('finanzas_inversiones_aprobar'), async (req, res) => {
  try {
    res.json(await aprobarInversion(req.params.id, req.body?.nota, req.authedUser!))
  } catch (err) {
    responderError(res, err, 'No pude aprobarla', 'aprobar')
  }
})

finanzasInversionesRouter.post('/:id/rechazar', requireFinanzasPermiso('finanzas_inversiones_aprobar'), async (req, res) => {
  try {
    res.json(await rechazarInversion(req.params.id, req.body?.motivo, req.authedUser!))
  } catch (err) {
    responderError(res, err, 'No pude rechazarla', 'rechazar')
  }
})

finanzasInversionesRouter.post('/:id/anular', async (req, res) => {
  try {
    res.json(await anularInversion(req.params.id, req.body?.motivo, req.authedUser!))
  } catch (err) {
    responderError(res, err, 'No pude anularla', 'anular')
  }
})

finanzasInversionesRouter.post('/:id/ingresos', async (req, res) => {
  try {
    res.json(await registrarIngreso(req.params.id, req.body, req.authedUser!))
  } catch (err) {
    responderError(res, err, 'No pude registrar el ingreso', 'ingreso')
  }
})

finanzasInversionesRouter.post('/:id/cuotas/:numero/en-pesos', async (req, res) => {
  try {
    res.json(await cuotaEnPesos(req.params.id, Number(req.params.numero), req.body?.tipoCambio ?? null, req.authedUser!))
  } catch (err) {
    responderError(res, err, 'No pude cambiar la moneda de la cuota', 'en pesos')
  }
})
