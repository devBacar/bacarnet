import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { parseMultipartUpload } from '../../../drive/parseMultipartUpload.js'
import {
  cobrarEnEfectivo,
  confirmarCobroLlegado,
  pagarCompromisoEnEfectivo,
  pasarCobroDeDia,
  pasarCompromisoDeDia,
  yaPagueCompromiso,
} from '../services/hoy.acciones.js'
import { armarHoy } from '../services/hoy.service.js'

export const finanzasHoyRouter = Router()

finanzasHoyRouter.use(requireWorkspaceUser, requireViewFinanzas)

function mensajeDe(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

finanzasHoyRouter.get('/', async (req, res) => {
  try {
    const hoy = await armarHoy({ actorUid: req.authedUser!.uid })
    res.json(hoy)
  } catch (err) {
    console.error('[finanzas/hoy] armar', err)
    res.status(500).json({ error: 'No pude armar el día. Probá de nuevo en un rato.' })
  }
})

async function leerCuerpo(req: import('express').Request): Promise<{
  body: Record<string, unknown>
  comprobante: { fileName: string; mimeType: string; buffer: Buffer } | null
}> {
  const contentType = req.headers['content-type'] ?? ''
  if (contentType.includes('multipart/form-data')) {
    const parsed = await parseMultipartUpload(req)
    const comprobante = parsed.file
      ? {
          fileName: parsed.file.originalname,
          mimeType: parsed.file.mimetype,
          buffer: parsed.file.buffer,
        }
      : null
    return { body: parsed.fields, comprobante }
  }
  return { body: (req.body ?? {}) as Record<string, unknown>, comprobante: null }
}

finanzasHoyRouter.post('/compromisos/:id/efectivo', async (req, res) => {
  try {
    const { body, comprobante } = await leerCuerpo(req)
    const cajaId = typeof body.cajaId === 'string' ? body.cajaId.trim() : ''
    if (!cajaId) {
      res.status(400).json({ error: 'Elegí la caja' })
      return
    }
    const resultado = await pagarCompromisoEnEfectivo({
      user: req.authedUser!,
      compromisoId: req.params.id,
      cajaId,
      comprobante,
    })
    res.json(resultado)
  } catch (err) {
    res.status(400).json({ error: mensajeDe(err, 'No se pudo anotar el pago en efectivo') })
  }
})

finanzasHoyRouter.post('/compromisos/:id/ya-pague', async (req, res) => {
  try {
    const resultado = await yaPagueCompromiso({
      user: req.authedUser!,
      compromisoId: req.params.id,
      body: (req.body ?? {}) as Record<string, unknown>,
    })
    res.json(resultado)
  } catch (err) {
    res.status(400).json({ error: mensajeDe(err, 'No se pudo marcar como pagado') })
  }
})

finanzasHoyRouter.post('/compromisos/:id/reprogramar', async (req, res) => {
  try {
    const fecha = typeof req.body?.fecha === 'string' ? req.body.fecha.trim() : ''
    const resultado = await pasarCompromisoDeDia({
      user: req.authedUser!,
      compromisoId: req.params.id,
      fecha,
    })
    res.json(resultado)
  } catch (err) {
    res.status(400).json({ error: mensajeDe(err, 'No se pudo cambiar el día') })
  }
})

finanzasHoyRouter.post('/cobros/:id/confirmar', async (req, res) => {
  try {
    const movimientoId = typeof req.body?.movimientoId === 'string' ? req.body.movimientoId.trim() : ''
    if (!movimientoId) {
      res.status(400).json({ error: 'Falta el movimiento del banco' })
      return
    }
    const resultado = await confirmarCobroLlegado({
      user: req.authedUser!,
      cobroId: req.params.id,
      movimientoId,
    })
    res.json(resultado)
  } catch (err) {
    res.status(400).json({ error: mensajeDe(err, 'No se pudo confirmar el cobro') })
  }
})

finanzasHoyRouter.post('/cobros/:id/efectivo', async (req, res) => {
  try {
    const { body, comprobante } = await leerCuerpo(req)
    const cajaId = typeof body.cajaId === 'string' ? body.cajaId.trim() : ''
    if (!cajaId) {
      res.status(400).json({ error: 'Elegí la caja' })
      return
    }
    const resultado = await cobrarEnEfectivo({
      user: req.authedUser!,
      cobroId: req.params.id,
      cajaId,
      comprobante,
    })
    res.json(resultado)
  } catch (err) {
    res.status(400).json({ error: mensajeDe(err, 'No se pudo anotar el ingreso en efectivo') })
  }
})

finanzasHoyRouter.post('/cobros/:id/reprogramar', async (req, res) => {
  try {
    const fecha = typeof req.body?.fecha === 'string' ? req.body.fecha.trim() : ''
    const resultado = await pasarCobroDeDia({
      user: req.authedUser!,
      cobroId: req.params.id,
      fecha,
    })
    res.json(resultado)
  } catch (err) {
    res.status(400).json({ error: mensajeDe(err, 'No se pudo cambiar el día') })
  }
})
