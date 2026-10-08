import { type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { logError } from '../../../../lib/log.js'
import { dateKeyInArgentina } from '../../agenda/domain/vencimiento.alert.js'
import { agendaTimestampToDate } from '../../agenda/domain/agendaTimestamps.js'
import { listarPagos, restanteAPagarCentavos } from '../../agenda/domain/pago-compromiso.js'
import {
  COBROS_COLLECTION,
  COMPROMISOS_COLLECTION,
  listAllCobros,
  listAllCompromisos,
} from '../../agenda/services/agenda.repository.js'
import type { CobroEsperadoDocument, CompromisoPagoDocument } from '../../agenda/domain/agenda.types.js'
import { CHEQUES_COLLECTION } from '../../cheques/services/cheques.repository.js'
import {
  MOVIMIENTOS_BANCARIOS_SYNC_COLLECTION,
  movimientosBancariosCollection,
} from '../../movimientos/services/movimientos.repository.js'
import { listCategoriaMovimientoDocuments } from '../../movimientos/services/categorias-movimientos.repository.js'
import { listCuentaDocuments } from '../../services/cuentas.repository.js'
import { listSaldosDiariosDeCuentas } from '../../services/saldos-diarios.repository.js'
import { partirPayloadCache } from '../domain/cacheTablero.js'
import { CACHE_TABLERO_MS, COLECCION_TABLERO, DIAS_PROXIMOS, DIAS_VARIACION_SALDO, MESES_EN_GRAFICO, SIN_BANCO } from '../domain/constantes.js'
import { inicioMes, mesDeFecha, sumarMeses, ultimoDiaMes } from '../domain/fechas.js'
import { sumarDias } from '../../hoy/domain/hoy.fechas.js'
import type {
  CategoriaTablero,
  ChequeTablero,
  CobroTablero,
  CompromisoTablero,
  CuentaTablero,
  FormaCheque,
  MonedaTablero,
  MovimientoTablero,
  SaldoDiarioTablero,
  TableroFinanzas,
} from '../domain/calcular.js'

const PAGINA = 2000

export interface DatosTablero {
  movimientos: MovimientoTablero[]
  categorias: CategoriaTablero[]
  cuentas: CuentaTablero[]
  saldosDiarios: SaldoDiarioTablero[]
  cheques: ChequeTablero[]
  compromisos: CompromisoTablero[]
  cobros: CobroTablero[]
}

interface CacheTablero {
  calculadoAtMs: number
  huella: string
  payload: TableroFinanzas
}

function texto(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const limpio = value.trim()
  return limpio || null
}

function monedaDe(value: unknown): MonedaTablero {
  return value === 'USD' ? 'USD' : 'ARS'
}

function millisDe(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    const millis = (value as { toMillis: () => number }).toMillis()
    return Number.isFinite(millis) ? millis : 0
  }
  return 0
}

function ymd(value: unknown): string | null {
  const date = agendaTimestampToDate(value)
  if (!date) return null
  const key = dateKeyInArgentina(date)
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null
}

function docId(mes: string, moneda: MonedaTablero): string {
  return `${mes}_${moneda}`
}

function aMovimiento(data: FirebaseFirestore.DocumentData): MovimientoTablero | null {
  if (data.tipo !== 'credito' && data.tipo !== 'debito') return null
  if (typeof data.montoCentavos !== 'number' || data.montoCentavos <= 0) return null
  const fecha = typeof data.fechaProceso === 'string' ? data.fechaProceso : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  return {
    fechaProceso: fecha,
    montoCentavos: data.montoCentavos,
    tipo: data.tipo,
    categoriaId: texto(data.categoriaId),
    cuentaId: texto(data.cuentaId) ?? '',
    bancoNombre: texto(data.bancoNombre) ?? 'Sin banco',
    moneda: monedaDe(data.moneda),
  }
}

/**
 * Un solo recorrido del rango (de a páginas, en orden de fecha).
 * No filtra por cuenta ni por moneda: eso se separa en memoria, sin índice compuesto.
 */
export async function listarMovimientosDelRango(desde: string, hasta: string): Promise<MovimientoTablero[]> {
  const filas: MovimientoTablero[] = []
  let cursor: QueryDocumentSnapshot | null = null
  for (;;) {
    let query = movimientosBancariosCollection()
      .where('fechaProceso', '>=', desde)
      .where('fechaProceso', '<=', hasta)
      .orderBy('fechaProceso')
      .select(
        'cuentaId',
        'fechaProceso',
        'montoCentavos',
        'tipo',
        'categoriaId',
        'moneda',
        'bancoNombre',
      )
      .limit(PAGINA)
    if (cursor) query = query.startAfter(cursor)
    const snap = await query.get()
    if (snap.empty) break
    for (const doc of snap.docs) {
      const fila = aMovimiento(doc.data())
      if (fila) filas.push(fila)
    }
    cursor = snap.docs[snap.docs.length - 1] ?? null
    if (snap.size < PAGINA) break
  }
  return filas
}

function formaDe(value: unknown): FormaCheque | null {
  if (value === 'fisico' || value === 'echeq') return value
  return null
}

function contraparteCheque(data: FirebaseFirestore.DocumentData, direccion: string): string {
  const nombre =
    direccion === 'emitido'
      ? texto(data.destinatario) || texto(data.emisor)
      : texto(data.emisor) || texto(data.cliente) || texto(data.endosante)
  return nombre || 'Sin nombre'
}

async function listarChequesDelRango(desde: string, hasta: string): Promise<ChequeTablero[]> {
  const snap = await adminDb()
    .collection(CHEQUES_COLLECTION)
    .where('fechaPago', '>=', desde)
    .where('fechaPago', '<=', hasta)
    .select('direccion', 'estado', 'fechaPago', 'montoCentavos', 'numero', 'tipo', 'bancoEmisor', 'emisor', 'destinatario', 'cliente', 'endosante')
    .get()
  const filas: ChequeTablero[] = []
  for (const doc of snap.docs) {
    const data = doc.data()
    if (data.direccion !== 'emitido' && data.direccion !== 'recibido') continue
    if (typeof data.fechaPago !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.fechaPago)) continue
    if (typeof data.montoCentavos !== 'number') continue
    filas.push({
      id: doc.id,
      direccion: data.direccion,
      estado: typeof data.estado === 'string' ? data.estado : '',
      fechaPago: data.fechaPago,
      montoCentavos: data.montoCentavos,
      numero: texto(data.numero) ?? '',
      forma: formaDe(data.tipo),
      banco: texto(data.bancoEmisor) ?? SIN_BANCO,
      contraparte: contraparteCheque(data, data.direccion),
    })
  }
  return filas
}

function mapCompromiso(id: string, data: CompromisoPagoDocument): CompromisoTablero | null {
  const fecha = ymd(data.fechaVencimiento)
  if (!fecha) return null
  return {
    id,
    nombre: data.proveedorONombre?.trim() || 'Sin nombre',
    concepto: data.concepto?.trim() || '',
    fecha,
    restanteCentavos: restanteAPagarCentavos({
      estado: data.estado,
      montoCentavos: data.montoCentavos,
      pagos: listarPagos(data.pagos),
    }),
    moneda: monedaDe(data.moneda),
    estado: data.estado,
    chequeId: typeof data.chequeId === 'string' && data.chequeId ? data.chequeId : null,
  }
}

function mapCobro(id: string, data: CobroEsperadoDocument): CobroTablero | null {
  const fecha = ymd(data.fechaEsperada)
  if (!fecha) return null
  return {
    id,
    nombre: data.clienteONombre?.trim() || 'Sin nombre',
    fecha,
    montoCentavos: typeof data.montoCentavos === 'number' ? data.montoCentavos : 0,
    moneda: monedaDe((data as { moneda?: unknown }).moneda),
    estado: data.estado,
    chequeId: typeof data.chequeId === 'string' && data.chequeId ? data.chequeId : null,
  }
}

export async function cargarDatosTablero(mes: string, hoy: string): Promise<DatosTablero> {
  const mesTope = mes > mesDeFecha(hoy) ? mes : mesDeFecha(hoy)
  const inicioGrafico = sumarMeses(mesTope, -(MESES_EN_GRAFICO - 1))
  const inicioDatos = sumarMeses(mes < inicioGrafico ? mes : inicioGrafico, -1)
  const desdeMov = inicioMes(inicioDatos)
  const hastaMov = ultimoDiaMes(mesTope)
  const hastaCheques = sumarDias(hoy, DIAS_PROXIMOS)
  const fechaPrevia = sumarDias(hoy, -DIAS_VARIACION_SALDO)

  const cuentasDocs = await listCuentaDocuments()
  const cuentaIds = cuentasDocs.map((cuenta) => cuenta.id)

  const [movimientos, categoriasDocs, saldosPrevio, cheques, compromisosDocs, cobrosDocs] = await Promise.all([
    listarMovimientosDelRango(desdeMov, hastaMov),
    listCategoriaMovimientoDocuments(),
    listSaldosDiariosDeCuentas({ cuentaIds, desde: fechaPrevia, hasta: fechaPrevia }),
    listarChequesDelRango(hoy, hastaCheques),
    listAllCompromisos(),
    listAllCobros(),
  ])

  const cuentas: CuentaTablero[] = cuentasDocs.map(({ id, data }) => ({
    id,
    bancoNombre: data.bancoNombre,
    moneda: monedaDe(data.moneda),
    saldoActualCentavos: typeof data.saldoActualCentavos === 'number' ? data.saldoActualCentavos : 0,
  }))

  const saldosDiarios: SaldoDiarioTablero[] = saldosPrevio.map((saldo) => ({
    cuentaId: saldo.cuentaId,
    fecha: saldo.fecha,
    saldoFinCentavos: saldo.saldoFinCentavos,
    moneda: monedaDe(saldo.moneda),
  }))

  return {
    movimientos,
    categorias: categoriasDocs.map(({ id, data }) => ({
      id,
      nombre: data.nombre,
      grupo: typeof data.grupo === 'string' && data.grupo.trim() ? data.grupo.trim() : null,
    })),
    cuentas,
    saldosDiarios,
    cheques,
    compromisos: compromisosDocs.flatMap(({ id, data }) => {
      const fila = mapCompromiso(id, data)
      return fila ? [fila] : []
    }),
    cobros: cobrosDocs.flatMap(({ id, data }) => {
      const fila = mapCobro(id, data)
      return fila ? [fila] : []
    }),
  }
}

function esPayload(value: unknown): value is TableroFinanzas {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<TableroFinanzas>
  return (
    typeof row.mes === 'string' &&
    row.resumen != null &&
    Array.isArray(row.porMes) &&
    Array.isArray(row.salidasPorGrupo) &&
    Array.isArray(row.entradasPorGrupo) &&
    row.proximos30 != null &&
    Array.isArray(row.proximos30.cheques)
  )
}

function docCheques(mes: string, moneda: MonedaTablero): string {
  return `${docId(mes, moneda)}_cheques`
}

export async function leerCacheTablero(mes: string, moneda: MonedaTablero): Promise<CacheTablero | null> {
  const snap = await adminDb().collection(COLECCION_TABLERO).doc(docId(mes, moneda)).get()
  if (!snap.exists) return null
  const data = snap.data()
  if (!data || data.version !== 2) return null
  if (typeof data.calculadoAtMs !== 'number' || typeof data.huella !== 'string') return null
  if (!esPayload(data.payload)) return null
  let payload = data.payload
  if (data.chequesAparte === true) {
    const extra = await adminDb().collection(COLECCION_TABLERO).doc(docCheques(mes, moneda)).get()
    const crudo = extra.data()
    if (!crudo || crudo.version !== 2 || !Array.isArray(crudo.cheques)) return null
    payload = { ...payload, proximos30: { ...payload.proximos30, cheques: crudo.cheques } }
  }
  return { calculadoAtMs: data.calculadoAtMs, huella: data.huella, payload }
}

export function cacheTableroVigente(cache: CacheTablero, ahoraMs: number): boolean {
  return ahoraMs - cache.calculadoAtMs < CACHE_TABLERO_MS
}

export async function guardarCacheTablero(input: {
  mes: string
  moneda: MonedaTablero
  huella: string
  payload: TableroFinanzas
  ahoraMs: number
}): Promise<void> {
  const parte = partirPayloadCache(input.payload)
  if (parte.modo === 'no-cachear') {
    logError('[finanzas/tablero] el tablero supera el tamaño de la caché y no se guardó', new Error('payload grande'))
    return
  }
  const db = adminDb()
  const ref = db.collection(COLECCION_TABLERO).doc(docId(input.mes, input.moneda))
  const refCheques = db.collection(COLECCION_TABLERO).doc(docCheques(input.mes, input.moneda))
  const batch = db.batch()
  batch.set(ref, {
    version: 2,
    mes: input.mes,
    moneda: input.moneda,
    calculadoAtMs: input.ahoraMs,
    huella: input.huella,
    chequesAparte: parte.modo === 'cheques-aparte',
    payload: parte.payload,
  })
  if (parte.modo === 'cheques-aparte') {
    batch.set(refCheques, { version: 2, calculadoAtMs: input.ahoraMs, cheques: parte.cheques })
  } else {
    batch.delete(refCheques)
  }
  await batch.commit()
}

async function ultimoCambio(coleccion: string): Promise<number> {
  const snap = await adminDb().collection(coleccion).orderBy('updatedAt', 'desc').limit(1).get()
  const doc = snap.docs[0]
  return doc ? millisDe(doc.get('updatedAt')) : 0
}

/** Marca barata para saber si el mes en curso cambió, sin leer los movimientos. */
export async function huellaDeFuentes(mes: string): Promise<string> {
  const desde = inicioMes(mes)
  const hasta = ultimoDiaMes(mes)
  const [syncSnap, cuentas, chequesAt, compromisosAt, cobrosAt, cantidadSnap] = await Promise.all([
    adminDb().collection(MOVIMIENTOS_BANCARIOS_SYNC_COLLECTION).get(),
    listCuentaDocuments(),
    ultimoCambio(CHEQUES_COLLECTION),
    ultimoCambio(COMPROMISOS_COLLECTION),
    ultimoCambio(COBROS_COLLECTION),
    movimientosBancariosCollection().where('fechaProceso', '>=', desde).where('fechaProceso', '<=', hasta).count().get(),
  ])
  const sync = syncSnap.docs
    .map((doc) => ({
      id: doc.id,
      hasta: String(doc.get('ultimaFechaSincronizada') ?? ''),
      filas: Number(doc.get('ultimoSyncFilas') ?? 0),
      at: millisDe(doc.get('ultimoSyncAt')),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
  const saldos = cuentas
    .map(({ id, data }) => ({ id, saldo: data.saldoActualCentavos ?? 0, at: millisDe(data.updatedAt) }))
    .sort((a, b) => a.id.localeCompare(b.id))
  return JSON.stringify({
    sync,
    saldos,
    chequesAt,
    compromisosAt,
    cobrosAt,
    cantidad: cantidadSnap.data().count,
  })
}

export async function huellaSegura(mes: string): Promise<string | null> {
  try {
    return await huellaDeFuentes(mes)
  } catch (err) {
    logError('[finanzas/tablero] no se pudo revisar si cambió algo', err)
    return null
  }
}
