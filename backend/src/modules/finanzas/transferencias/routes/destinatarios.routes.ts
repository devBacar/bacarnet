import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import {
  DestinatarioHttpError,
  actualizarDestinatarioApi,
  crearDestinatarioApi,
  eliminarDestinatarioApi,
  listDestinatariosApi,
} from '../services/destinatarios.service.js'

export const finanzasDestinatariosRouter = Router()

finanzasDestinatariosRouter.use(requireWorkspaceUser, requireViewFinanzas)

function one(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function responder(err: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }, log: string) {
  console.error(log, err)
  if (err instanceof DestinatarioHttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  const message = err instanceof Error ? err.message : 'No se pudo completar la operación'
  res.status(400).json({ error: message })
}

finanzasDestinatariosRouter.get('/', async (req, res) => {
  try {
    const result = await listDestinatariosApi({
      q: one(req.query.q),
      tipo: one(req.query.tipo),
    })
    res.json(result)
  } catch (err) {
    responder(err, res, '[finanzas/destinatarios] listar')
  }
})

finanzasDestinatariosRouter.post('/', async (req, res) => {
  try {
    const result = await crearDestinatarioApi({
      actorUid: req.authedUser!.uid,
      body: req.body as Record<string, unknown>,
    })
    res.status(201).json(result)
  } catch (err) {
    responder(err, res, '[finanzas/destinatarios] alta')
  }
})

finanzasDestinatariosRouter.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id
    if (!id || Array.isArray(id)) {
      res.status(400).json({ error: 'Destinatario inválido' })
      return
    }
    const result = await actualizarDestinatarioApi({
      id,
      body: req.body as Record<string, unknown>,
    })
    res.json(result)
  } catch (err) {
    responder(err, res, '[finanzas/destinatarios] editar')
  }
})

finanzasDestinatariosRouter.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id
    if (!id || Array.isArray(id)) {
      res.status(400).json({ error: 'Destinatario inválido' })
      return
    }
    await eliminarDestinatarioApi(id)
    res.json({ ok: true })
  } catch (err) {
    responder(err, res, '[finanzas/destinatarios] borrar')
  }
})
