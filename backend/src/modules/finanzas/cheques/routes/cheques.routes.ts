import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { listChequesApi, getResumenDiario, importChequesExcel, ingresarChequesPegados } from '../services/cheques.service.js'
import { updateChequeEstado } from '../services/cheques.repository.js'
import { parseMultipartUpload } from '../../../drive/parseMultipartUpload.js'
import type { ChequeDireccion, ChequeEstado, ChequeOrigen, ChequeTipo } from '../domain/cheque.types.js'

export const finanzasChequesRouter = Router()

finanzasChequesRouter.use(requireWorkspaceUser, requireViewFinanzas)

finanzasChequesRouter.get('/', async (req, res) => {
  try {
    const one = (value: unknown) => (typeof value === 'string' ? value : undefined)
    const result = await listChequesApi({
      direccion: one(req.query.direccion),
      origen: one(req.query.origen),
      estado: one(req.query.estado),
      tipo: one(req.query.tipo),
      desde: one(req.query.desde),
      hasta: one(req.query.hasta),
      page: one(req.query.page),
      limit: one(req.query.limit),
    })
    res.json(result)
  } catch (err) {
    console.error('[finanzas/cheques] listar', err)
    const message = err instanceof Error ? err.message : 'No se pudieron listar los cheques'
    res.status(400).json({ error: message })
  }
})

finanzasChequesRouter.get('/resumen-diario', async (_req, res) => {
  try {
    const result = await getResumenDiario()
    res.json(result)
  } catch (err) {
    console.error('[finanzas/cheques] resumen diario', err)
    res.status(500).json({ error: 'No se pudo obtener el resumen diario' })
  }
})

finanzasChequesRouter.post('/import', async (req, res) => {
  const actorUid = req.authedUser?.uid
  if (!actorUid) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  try {
    const parsed = await parseMultipartUpload(req)
    if (!parsed.file) {
      res.status(400).json({ error: 'No se recibió ningún archivo' })
      return
    }
    const ext = parsed.file.originalname.split('.').pop()?.toLowerCase()
    if (ext !== 'xlsx' && ext !== 'xls') {
      res.status(400).json({ error: 'Solo se aceptan archivos .xlsx o .xls' })
      return
    }
    const result = await importChequesExcel({ buffer: parsed.file.buffer, actorUid })
    res.json(result)
  } catch (err) {
    console.error('[finanzas/cheques] import', err)
    const message = err instanceof Error ? err.message : 'No se pudo importar el archivo'
    res.status(400).json({ error: message })
  }
})

const VALID_DIRECCIONES: ChequeDireccion[] = ['recibido', 'emitido']
const VALID_ORIGENES: ChequeOrigen[] = ['cliente', 'tercero', 'propio']
const VALID_TIPOS: ChequeTipo[] = ['echeq', 'fisico']

finanzasChequesRouter.post('/ingresar', async (req, res) => {
  const actorUid = req.authedUser?.uid
  if (!actorUid) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  try {
    const { direccion, origen, rows } = req.body as { direccion?: string; origen?: string; rows?: unknown[] }
    if (!direccion || !VALID_DIRECCIONES.includes(direccion as ChequeDireccion)) {
      res.status(400).json({ error: `direccion inválida, debe ser: ${VALID_DIRECCIONES.join(', ')}` })
      return
    }
    if (!origen || !VALID_ORIGENES.includes(origen as ChequeOrigen)) {
      res.status(400).json({ error: `origen inválido, debe ser uno de: ${VALID_ORIGENES.join(', ')}` })
      return
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'rows debe ser un array no vacío' })
      return
    }
    for (const r of rows) {
      if (typeof r !== 'object' || r === null) {
        res.status(400).json({ error: 'Cada fila debe ser un objeto' })
        return
      }
      const row = r as Record<string, unknown>
      if (typeof row.tipo !== 'string' || !VALID_TIPOS.includes(row.tipo as ChequeTipo)) {
        res.status(400).json({ error: `tipo inválido en fila, debe ser echeq o fisico` })
        return
      }
    }
    const result = await ingresarChequesPegados({
      direccion: direccion as ChequeDireccion,
      origen: origen as ChequeOrigen,
      rows: rows as Parameters<typeof ingresarChequesPegados>[0]['rows'],
      actorUid,
    })
    res.json(result)
  } catch (err) {
    console.error('[finanzas/cheques] ingresar', err)
    const message = err instanceof Error ? err.message : 'No se pudieron ingresar los cheques'
    res.status(400).json({ error: message })
  }
})

const VALID_ESTADOS: ChequeEstado[] = [
  'en_cartera', 'depositado', 'vendido', 'rechazado',
  'pendiente', 'debitado', 'anulado',
]

finanzasChequesRouter.patch('/:id/estado', async (req, res) => {
  try {
    const { estado } = req.body as { estado?: string }
    if (!estado || !VALID_ESTADOS.includes(estado as ChequeEstado)) {
      res.status(400).json({ error: `estado inválido, debe ser uno de: ${VALID_ESTADOS.join(', ')}` })
      return
    }
    await updateChequeEstado({ id: req.params.id, estado: estado as ChequeEstado })
    res.json({ ok: true })
  } catch (err) {
    console.error('[finanzas/cheques] update estado', err)
    const message = err instanceof Error ? err.message : 'No se pudo actualizar el estado'
    res.status(400).json({ error: message })
  }
})
