import { Router } from 'express'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { requireFinanzasPermiso, requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { listChequesApi, getResumenDiario, importChequesExcel, ingresarChequesPegados } from '../services/cheques.service.js'
import {
  getChequeById,
  buscarPendientesPorVientriId,
  updateChequeEstado,
  desvincularChequesFueraDeVentana,
  corregirPagoProveedorDebitado,
  marcarPendienteDeRenovar,
  listarPendientesDeRenovar,
  confirmarRenovacionManual,
  confirmarRenovacionManualBatch,
  ChequeNoEncontradoError,
  ChequeYaRenovadoError,
  ChequeNuevoYaExisteError,
} from '../services/cheques.repository.js'
import { reconciliarChequesConMovimientos } from '../services/reconciliar-cheques-movimientos.js'
import { sincronizarChequesDesdeVientri } from '../services/sincronizar-desde-vientri.js'
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
      vinculacion: one(req.query.vinculacion),
      comprobante: one(req.query.comprobante),
      interesEncubierto: one(req.query.interesEncubierto),
      desde: one(req.query.desde),
      hasta: one(req.query.hasta),
      q: one(req.query.q),
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

finanzasChequesRouter.post('/import', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
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

finanzasChequesRouter.post('/ingresar', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
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
  'pendiente', 'debitado', 'renovado',
]


finanzasChequesRouter.post('/desvincular-fuera-de-ventana', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
  try {
    const dryRun = req.query.dryRun === '1'
    const result = await desvincularChequesFueraDeVentana({ dryRun })
    res.json(result)
  } catch (err) {
    console.error('[finanzas/cheques] desvincular fuera de ventana', err)
    const message = err instanceof Error ? err.message : 'No se pudo desvincular'
    res.status(500).json({ error: message })
  }
})

finanzasChequesRouter.post('/corregir-pago-proveedor', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
  try {
    const dryRun = req.query.dryRun === '1'
    const result = await corregirPagoProveedorDebitado({ dryRun })
    res.json(result)
  } catch (err) {
    console.error('[finanzas/cheques] corregir pago proveedor', err)
    const message = err instanceof Error ? err.message : 'No se pudo corregir'
    res.status(500).json({ error: message })
  }
})

finanzasChequesRouter.post('/sincronizar-vientri', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
  const actorUid = req.authedUser?.uid
  if (!actorUid) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  try {
    const result = await sincronizarChequesDesdeVientri(actorUid)
    res.json(result)
  } catch (err) {
    console.error('[finanzas/cheques] sincronizar-vientri', err)
    const message = err instanceof Error ? err.message : 'No se pudo sincronizar desde Vientri'
    res.status(500).json({ error: message })
  }
})

finanzasChequesRouter.post('/reconciliar', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
  try {
    const detalle = req.query.detalle === '1'
    const result = await reconciliarChequesConMovimientos({ detalle })
    res.json(result)
  } catch (err) {
    console.error('[finanzas/cheques] reconciliar', err)
    const message = err instanceof Error ? err.message : 'No se pudo reconciliar'
    res.status(500).json({ error: message })
  }
})

finanzasChequesRouter.get('/:id/detalle', async (req, res) => {
  try {
    const id = req.params.id
    if (!id || Array.isArray(id)) { res.status(400).json({ error: 'Id inválido' }); return }
    const cheque = await getChequeById(id)
    if (!cheque) { res.status(404).json({ error: 'Cheque no encontrado' }); return }

    let movimiento = null
    if (cheque.movimientoBancarioId) {
      const movSnap = await adminDb().collection('movimientosBancarios').doc(cheque.movimientoBancarioId).get()
      if (movSnap.exists) {
        const d = movSnap.data()!
        const contraparte = typeof d.contraparte === 'string' ? d.contraparte : d.contraparte ?? null
        movimiento = {
          id: movSnap.id,
          fechaProceso: String(d.fechaProceso ?? ''),
          descripcion: String(d.descripcion ?? ''),
          contraparte,
          tipo: String(d.tipo ?? ''),
          montoCentavos: typeof d.montoCentavos === 'number' ? d.montoCentavos : 0,
          bancoNombre: String(d.bancoNombre ?? ''),
          nota: typeof d.nota === 'string' ? d.nota : null,
        }
      }
    }

    const cmpIds: number[] = []
    if (cheque.vientriCmpIngreso) cmpIds.push(cheque.vientriCmpIngreso)
    if (cheque.vientriCmpSalida) cmpIds.push(cheque.vientriCmpSalida)
    const pendientesMap = await buscarPendientesPorVientriId(cmpIds)

    const comprobantes = {
      ingreso: cheque.vientriCmpIngreso ? pendientesMap.get(cheque.vientriCmpIngreso) ?? null : null,
      salida: cheque.vientriCmpSalida ? pendientesMap.get(cheque.vientriCmpSalida) ?? null : null,
    }

    let facturasIngreso: Array<{ comprobante: string; persona: string | null; totalCentavos: number; obs: string | null }> = []
    let facturasEgreso: Array<{ comprobante: string; persona: string | null; totalCentavos: number; obs: string | null }> = []
    if (cheque.vientriClave) {
      const vSnap = await adminDb().collection('vientriCheques').doc(cheque.vientriClave).get()
      if (vSnap.exists) {
        const vData = vSnap.data()!
        if (Array.isArray(vData.facturasIngreso)) facturasIngreso = vData.facturasIngreso
        if (Array.isArray(vData.facturasEgreso)) facturasEgreso = vData.facturasEgreso
      }
    }

    res.json({ cheque, movimiento, comprobantes, facturasIngreso, facturasEgreso })
  } catch (err) {
    console.error('[finanzas/cheques] get detalle', err)
    res.status(500).json({ error: 'No se pudo obtener el detalle del cheque' })
  }
})

finanzasChequesRouter.get('/pendientes-de-renovar', async (_req, res) => {
  try {
    const pendientes = await listarPendientesDeRenovar()
    res.json({ pendientes })
  } catch (err) {
    console.error('[finanzas/cheques] listar pendientes de renovar', err)
    res.status(500).json({ error: 'No se pudo traer la lista de pendientes de renovar' })
  }
})

finanzasChequesRouter.get('/:id', async (req, res) => {
  try {
    const id = req.params.id
    if (!id || Array.isArray(id)) { res.status(400).json({ error: 'Id inválido' }); return }
    const cheque = await getChequeById(id)
    if (!cheque) { res.status(404).json({ error: 'Cheque no encontrado' }); return }
    res.json({ cheque })
  } catch (err) {
    console.error('[finanzas/cheques] get by id', err)
    res.status(500).json({ error: 'No se pudo obtener el cheque' })
  }
})

finanzasChequesRouter.patch('/:id/estado', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
  try {
    const { estado } = req.body as { estado?: string }
    if (!estado || !VALID_ESTADOS.includes(estado as ChequeEstado)) {
      res.status(400).json({ error: `estado inválido, debe ser uno de: ${VALID_ESTADOS.join(', ')}` })
      return
    }
    await updateChequeEstado({
      id: req.params.id,
      estado: estado as ChequeEstado,
      actorUid: req.authedUser?.uid ?? null,
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('[finanzas/cheques] update estado', err)
    const message = err instanceof Error ? err.message : 'No se pudo actualizar el estado'
    res.status(400).json({ error: message })
  }
})

finanzasChequesRouter.post('/:id/marcar-pendiente-renovar', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
  try {
    const actorUid = req.authedUser?.uid
    if (!actorUid) { res.status(401).json({ error: 'No autenticado' }); return }
    await marcarPendienteDeRenovar({ id: req.params.id, actorUid })
    res.json({ ok: true })
  } catch (err) {
    if (err instanceof ChequeNoEncontradoError) { res.status(404).json({ error: err.message }); return }
    if (err instanceof ChequeYaRenovadoError) { res.status(409).json({ error: err.message }); return }
    console.error('[finanzas/cheques] marcar pendiente de renovar', err)
    res.status(400).json({ error: err instanceof Error ? err.message : 'No se pudo marcar el cheque' })
  }
})

finanzasChequesRouter.post('/confirmar-renovacion-batch', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
  try {
    const actorUid = req.authedUser?.uid
    if (!actorUid) { res.status(401).json({ error: 'No autenticado' }); return }
    const body = req.body as {
      chequeViejoIds?: unknown
      chequesNuevos?: unknown[]
      operacionId?: unknown
    }
    if (!Array.isArray(body.chequeViejoIds) || body.chequeViejoIds.some((x) => typeof x !== 'string') || body.chequeViejoIds.length === 0) {
      res.status(400).json({ error: 'Elegí al menos un cheque para renovar' })
      return
    }
    if (!Array.isArray(body.chequesNuevos) || body.chequesNuevos.length === 0) {
      res.status(400).json({ error: 'Debe haber al menos un cheque nuevo' })
      return
    }
    const chequesNuevos = (body.chequesNuevos as Array<Record<string, unknown>>).map((cn) => {
      if (typeof cn.numero !== 'string' || !cn.numero.trim() || typeof cn.fechaPago !== 'string' || !cn.fechaPago.trim() || typeof cn.montoCentavos !== 'number' || cn.montoCentavos <= 0) {
        throw new Error('Cada cheque nuevo necesita número, fecha de pago y monto')
      }
      return {
        numero: cn.numero.trim(),
        bancoEmisor: typeof cn.bancoEmisor === 'string' ? cn.bancoEmisor.trim() || null : null,
        fechaPago: cn.fechaPago.trim(),
        montoCentavos: cn.montoCentavos,
        destinatario: typeof cn.destinatario === 'string' ? cn.destinatario.trim() || null : null,
      }
    })
    const resultado = await confirmarRenovacionManualBatch({
      chequeViejoIds: body.chequeViejoIds as string[],
      chequesNuevos,
      actorUid,
      operacionId: typeof body.operacionId === 'string' ? body.operacionId : undefined,
    })
    res.json({ mensaje: 'Renovación confirmada', ...resultado })
  } catch (err) {
    if (err instanceof ChequeNoEncontradoError) { res.status(404).json({ error: err.message }); return }
    if (err instanceof ChequeYaRenovadoError) { res.status(409).json({ error: err.message }); return }
    if (err instanceof ChequeNuevoYaExisteError) { res.status(409).json({ error: err.message }); return }
    console.error('[finanzas/cheques] confirmar renovación batch', err)
    res.status(400).json({ error: err instanceof Error ? err.message : 'No se pudo confirmar la renovación' })
  }
})

finanzasChequesRouter.post('/confirmar-renovacion', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
  try {
    const actorUid = req.authedUser?.uid
    if (!actorUid) { res.status(401).json({ error: 'No autenticado' }); return }
    const body = req.body as {
      chequeViejoIds?: unknown
      chequeNuevo?: { numero?: unknown; bancoEmisor?: unknown; fechaPago?: unknown; montoCentavos?: unknown; destinatario?: unknown }
    }
    if (!Array.isArray(body.chequeViejoIds) || body.chequeViejoIds.some((x) => typeof x !== 'string') || body.chequeViejoIds.length === 0) {
      res.status(400).json({ error: 'Elegí al menos un cheque para renovar' })
      return
    }
    const cn = body.chequeNuevo ?? {}
    if (
      typeof cn.numero !== 'string' || !cn.numero.trim() ||
      typeof cn.fechaPago !== 'string' || !cn.fechaPago.trim() ||
      typeof cn.montoCentavos !== 'number' || cn.montoCentavos <= 0
    ) {
      res.status(400).json({ error: 'Faltan los datos del cheque nuevo (número, fecha de pago y monto)' })
      return
    }
    const resultado = await confirmarRenovacionManual({
      chequeViejoIds: body.chequeViejoIds as string[],
      chequeNuevo: {
        numero: cn.numero.trim(),
        bancoEmisor: typeof cn.bancoEmisor === 'string' ? cn.bancoEmisor.trim() || null : null,
        fechaPago: cn.fechaPago.trim(),
        montoCentavos: cn.montoCentavos,
        destinatario: typeof cn.destinatario === 'string' ? cn.destinatario.trim() || null : null,
      },
      actorUid,
    })
    res.json({ mensaje: 'Renovación confirmada', ...resultado })
  } catch (err) {
    if (err instanceof ChequeNoEncontradoError) { res.status(404).json({ error: err.message }); return }
    if (err instanceof ChequeYaRenovadoError) { res.status(409).json({ error: err.message }); return }
    if (err instanceof ChequeNuevoYaExisteError) { res.status(409).json({ error: err.message }); return }
    console.error('[finanzas/cheques] confirmar renovación', err)
    res.status(400).json({ error: err instanceof Error ? err.message : 'No se pudo confirmar la renovación' })
  }
})
