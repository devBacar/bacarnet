import { Router } from 'express'
import Busboy from 'busboy'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { parseMultipartUpload } from '../../../drive/parseMultipartUpload.js'
import { MULTIPART_UPLOAD_MAX_BYTES } from '../../../drive/uploadLimits.js'
import {
  cobrarEnEfectivo,
  confirmarCobroLlegado,
  PagoCombinadoIncompletoError,
  pagarCompromisoCombinado,
  pagarCompromisoConChequeDeCartera,
  pagarCompromisoEnEfectivo,
  pasarCobroDeDia,
  pasarCompromisoDeDia,
  yaPagueCompromiso,
} from '../services/hoy.acciones.js'
import { esEntornoDePruebas, MENSAJE_SOLO_PRUEBAS, SoloEnPruebasError } from '../domain/hoy.demo.js'
import { borrarDatosDemo } from '../services/hoy.demo.js'
import { armarHoy, listarChequesEnCartera } from '../services/hoy.service.js'

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

/** Borra los datos de ejemplo (`demo: true`). Solo con el emulador; en producción responde 403. */
finanzasHoyRouter.delete('/demo', async (_req, res) => {
  if (!esEntornoDePruebas()) {
    res.status(403).json({ error: MENSAJE_SOLO_PRUEBAS })
    return
  }
  try {
    const resultado = await borrarDatosDemo()
    res.json({
      ...resultado,
      mensaje:
        resultado.total === 0
          ? 'No había datos de ejemplo para borrar.'
          : `Listo. Borré ${resultado.total} ${resultado.total === 1 ? 'dato' : 'datos'} de ejemplo.`,
    })
  } catch (err) {
    if (err instanceof SoloEnPruebasError) {
      res.status(403).json({ error: err.message })
      return
    }
    console.error('[finanzas/hoy] borrar demo', err)
    res.status(500).json({ error: 'No pude borrar los datos de ejemplo.' })
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

finanzasHoyRouter.get('/cartera', async (req, res) => {
  try {
    const raw = typeof req.query.montoCentavos === 'string' ? req.query.montoCentavos : ''
    const montoCentavos = Number(raw)
    if (!Number.isInteger(montoCentavos) || montoCentavos < 0) {
      res.status(400).json({ error: 'Falta el monto del pago' })
      return
    }
    const cheques = await listarChequesEnCartera(montoCentavos)
    res.json({ cheques })
  } catch (err) {
    console.error('[finanzas/hoy] cartera', err)
    res.status(500).json({ error: 'No pude mirar los cheques de la cartera.' })
  }
})

async function leerPagoCombinado(req: import('express').Request): Promise<{
  partes: unknown
  comprobantes: Map<number, { fileName: string; mimeType: string; buffer: Buffer }>
}> {
  const contentType = req.headers['content-type'] ?? ''
  if (!contentType.includes('multipart/form-data')) {
    const body = (req.body ?? {}) as { partes?: unknown }
    return { partes: body.partes, comprobantes: new Map() }
  }
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {}
    const comprobantes = new Map<number, { fileName: string; mimeType: string; buffer: Buffer }>()
    let tooLarge = false
    let parser: ReturnType<typeof Busboy>
    try {
      parser = Busboy({
        headers: req.headers,
        limits: { fileSize: MULTIPART_UPLOAD_MAX_BYTES, files: 8, fields: 12 },
      })
    } catch (err) {
      reject(err)
      return
    }
    parser.on('field', (name, value) => {
      fields[name] = value
    })
    parser.on('file', (fieldName, stream, info) => {
      const chunks: Buffer[] = []
      let size = 0
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        size += chunk.length
      })
      stream.on('limit', () => {
        tooLarge = true
      })
      stream.on('end', () => {
        const match = /^comprobante_(\d+)$/.exec(fieldName)
        if (!match || size === 0) return
        comprobantes.set(Number(match[1]), {
          fileName: info.filename,
          mimeType: info.mimeType,
          buffer: Buffer.concat(chunks),
        })
      })
    })
    parser.on('error', reject)
    parser.on('finish', () => {
      if (tooLarge) {
        reject(new Error('El comprobante es demasiado grande'))
        return
      }
      let partes: unknown = []
      try {
        partes = fields.partes ? JSON.parse(fields.partes) : []
      } catch {
        reject(new Error('No pude leer las formas de pago'))
        return
      }
      resolve({ partes, comprobantes })
    })
    const rawBody = (req as import('express').Request & { rawBody?: Buffer }).rawBody
    if (rawBody && rawBody.length > 0) parser.end(rawBody)
    else if (req.readable) req.pipe(parser)
    else reject(new Error('No llegó el pago'))
  })
}

finanzasHoyRouter.post('/compromisos/:id/pago-combinado', async (req, res) => {
  try {
    const { partes, comprobantes } = await leerPagoCombinado(req)
    const resultado = await pagarCompromisoCombinado({
      user: req.authedUser!,
      compromisoId: req.params.id,
      partes,
      comprobantes,
    })
    res.json(resultado)
  } catch (err) {
    const status = err instanceof PagoCombinadoIncompletoError ? 409 : 400
    res.status(status).json({ error: mensajeDe(err, 'No se pudo anotar el pago') })
  }
})

finanzasHoyRouter.post('/compromisos/:id/cheque', async (req, res) => {
  try {
    const chequeId = typeof req.body?.chequeId === 'string' ? req.body.chequeId.trim() : ''
    if (!chequeId) {
      res.status(400).json({ error: 'Elegí el cheque' })
      return
    }
    const resultado = await pagarCompromisoConChequeDeCartera({
      user: req.authedUser!,
      compromisoId: req.params.id,
      chequeId,
    })
    res.json(resultado)
  } catch (err) {
    res.status(400).json({ error: mensajeDe(err, 'No se pudo endosar el cheque') })
  }
})

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
