import {
  AggregateField,
  FieldPath,
  FieldValue,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import type { BancoNombre } from '../../domain/cuenta.types.js'
import type { MovimientoBancarioMapped } from '../domain/movimiento-bancario.map.js'
import {
  emparejarAnotaciones,
  huellaMovimiento,
  huellaMovimientoSinDescripcion,
  type AnotacionMovimiento,
} from '../domain/movimiento-huella.js'
import type { ContraparteGuardada } from '../../contraparte/domain/contraparte.types.js'
import { vistaContraparte } from '../../contraparte/domain/vista-contraparte.js'
import type { MovimientoBancarioSyncDocument } from '../domain/movimiento-bancario.types.js'
import {
  aplicarReglasAFilas,
  reglaAplicableDesdeDocumento,
  type ReglaCategorizacionAplicable,
} from '../domain/regla-categorizacion.js'
import { listReglaCategorizacionDocuments } from './reglas-categorizacion.repository.js'

export const MOVIMIENTOS_BANCARIOS_COLLECTION = 'movimientosBancarios'
export const MOVIMIENTOS_BANCARIOS_SYNC_COLLECTION = 'movimientosBancariosSync'

const WRITE_CHUNK = 400

export function movimientosBancariosCollection() {
  return adminDb().collection(MOVIMIENTOS_BANCARIOS_COLLECTION)
}

function syncCollection() {
  return adminDb().collection(MOVIMIENTOS_BANCARIOS_SYNC_COLLECTION)
}

/** Turno del sync: evita que el botón y el programado reemplacen el mismo tramo a la vez. */
function syncTurnoRef() {
  return adminDb().collection('finanzasLocks').doc('movimientos-sync')
}

/** true si tomó el turno. Un turno vencido (proceso caído) se puede volver a tomar. */
export async function tomarTurnoSyncMovimientos(input: {
  token: string
  actorUid: string
  duracionMs: number
}): Promise<boolean> {
  const ref = syncTurnoRef()
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const hasta = snap.exists ? Number(snap.get('hastaMs') ?? 0) : 0
    if (hasta > Date.now()) return false
    tx.set(ref, {
      token: input.token,
      actorUid: input.actorUid,
      hastaMs: Date.now() + input.duracionMs,
      tomadoAt: FieldValue.serverTimestamp(),
    })
    return true
  })
}

export async function liberarTurnoSyncMovimientos(token: string): Promise<void> {
  const ref = syncTurnoRef()
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists && snap.get('token') === token) tx.delete(ref)
  })
}

export async function getMovimientosSyncEstado(
  cuentaId: string,
): Promise<MovimientoBancarioSyncDocument | null> {
  const snap = await syncCollection().doc(cuentaId).get()
  return snap.exists ? (snap.data() as MovimientoBancarioSyncDocument) : null
}

export async function countMovimientosBancarios(cuentaId?: string): Promise<number> {
  const base = movimientosBancariosCollection()
  const query = cuentaId ? base.where('cuentaId', '==', cuentaId) : base
  const snap = await query.count().get()
  return snap.data().count
}

function textoGuardado(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const texto = value.trim()
  return texto || null
}

function anotacionDeDocumento(data: DocumentData): AnotacionMovimiento | null {
  const categoriaId = typeof data.categoriaId === 'string' && data.categoriaId ? data.categoriaId : null
  const nota = typeof data.nota === 'string' && data.nota.trim() ? data.nota.trim() : null
  const manual = data.contraparteOrigen === 'manual'
  if (!categoriaId && !nota && !manual) return null
  return {
    huella: huellaMovimiento(data),
    huellaSinDescripcion: huellaMovimientoSinDescripcion(data),
    categoriaId,
    nota,
    contraparteNombre: manual ? textoGuardado(data.contraparteNombre) : null,
    contraparteCuit: manual ? textoGuardado(data.contraparteCuit) : null,
    contraparteOrigen: manual ? 'manual' : null,
  }
}

/** Borra el tramo y devuelve categoría/nota para reaplicarlas en las filas nuevas. */
async function deleteRango(input: {
  cuentaId: string
  desde: string
  hasta: string
}): Promise<{ eliminados: number; anotaciones: AnotacionMovimiento[] }> {
  const db = adminDb()
  let eliminados = 0
  const anotaciones: AnotacionMovimiento[] = []
  for (;;) {
    const snap = await movimientosBancariosCollection()
      .where('cuentaId', '==', input.cuentaId)
      .where('fechaProceso', '>=', input.desde)
      .where('fechaProceso', '<=', input.hasta)
      .limit(WRITE_CHUNK)
      .get()
    if (snap.empty) return { eliminados, anotaciones }
    const batch = db.batch()
    for (const doc of snap.docs) {
      const anotacion = anotacionDeDocumento(doc.data())
      if (anotacion) anotaciones.push(anotacion)
      batch.delete(doc.ref)
    }
    await batch.commit()
    eliminados += snap.size
    if (snap.size < WRITE_CHUNK) return { eliminados, anotaciones }
  }
}

async function cargarReglasAplicables(): Promise<ReglaCategorizacionAplicable[]> {
  const reglas = await listReglaCategorizacionDocuments()
  const aplicables: ReglaCategorizacionAplicable[] = []
  for (const regla of reglas) {
    const aplicable = reglaAplicableDesdeDocumento(regla.data)
    if (aplicable) aplicables.push(aplicable)
  }
  return aplicables
}

async function insertRows(input: {
  rows: MovimientoBancarioMapped[]
  syncedBy: string
  anotaciones: AnotacionMovimiento[]
}): Promise<{ insertados: number; autoCategorizados: number }> {
  const db = adminDb()
  const col = movimientosBancariosCollection()
  const conAnotacion = emparejarAnotaciones(input.rows, input.anotaciones)
  const { filas, categorizadas } = aplicarReglasAFilas(conAnotacion, await cargarReglasAplicables())
  let insertados = 0
  for (let i = 0; i < filas.length; i += WRITE_CHUNK) {
    const slice = filas.slice(i, i + WRITE_CHUNK)
    const batch = db.batch()
    for (const row of slice) {
      batch.set(col.doc(), {
        ...row,
        createdAt: FieldValue.serverTimestamp(),
        syncedBy: input.syncedBy,
      })
    }
    await batch.commit()
    insertados += slice.length
  }
  return { insertados, autoCategorizados: categorizadas }
}

/** Recorre todos los documentos de una query de a tandas y aplica un update a cada uno. */
async function updateEnTandas(query: Query, patch: Record<string, unknown>): Promise<number> {
  const db = adminDb()
  let actualizados = 0
  let cursor: QueryDocumentSnapshot | null = null
  for (;;) {
    let page = query.orderBy(FieldPath.documentId()).limit(WRITE_CHUNK)
    if (cursor) page = page.startAfter(cursor)
    const snap = await page.get()
    if (snap.empty) return actualizados
    const batch = db.batch()
    for (const doc of snap.docs) batch.update(doc.ref, patch)
    await batch.commit()
    actualizados += snap.size
    cursor = snap.docs[snap.docs.length - 1] ?? null
    if (snap.size < WRITE_CHUNK) return actualizados
  }
}

/** Pasa todos los movimientos de una categoría a otra. */
export async function moverCategoriaEnMovimientos(origenId: string, destinoId: string): Promise<number> {
  return updateEnTandas(movimientosBancariosCollection().where('categoriaId', '==', origenId), {
    categoriaId: destinoId,
  })
}

/** Deja sin categoría a los movimientos que la tenían. No borra nada más. */
export async function desasignarCategoriaEnMovimientos(categoriaId: string): Promise<number> {
  const query = movimientosBancariosCollection().where('categoriaId', '==', categoriaId)
  return updateEnTandas(query, { categoriaId: null })
}

export async function countMovimientosPorCategoria(categoriaId: string): Promise<number> {
  const snap = await movimientosBancariosCollection().where('categoriaId', '==', categoriaId).count().get()
  return snap.data().count
}

export interface MovimientoParaRegla {
  id: string
  descripcion: string
  codeDescriptionIb: string | null
  customerCuit: string | null
  categoriaId: string | null
}

function movimientoParaRegla(id: string, data: DocumentData): MovimientoParaRegla {
  return {
    id,
    descripcion: typeof data.descripcion === 'string' ? data.descripcion : '',
    codeDescriptionIb:
      typeof data.codeDescriptionIb === 'string' && data.codeDescriptionIb ? data.codeDescriptionIb : null,
    customerCuit: typeof data.customerCuit === 'string' && data.customerCuit ? data.customerCuit : null,
    categoriaId: typeof data.categoriaId === 'string' && data.categoriaId ? data.categoriaId : null,
  }
}

/**
 * Recorre movimientos de a WRITE_CHUNK, ordenados por id.
 * `sinCategoria` = categoriaId vacío. Firestore no encuentra con `== null` los documentos
 * que directamente no tienen el campo (hay miles así), por eso se filtra en memoria.
 */
export async function eachMovimientoParaCategorizar(
  filtro: { kind: 'sinCategoria' } | { kind: 'categoria'; categoriaId: string } | { kind: 'todos' },
  visit: (rows: MovimientoParaRegla[]) => Promise<void> | void,
): Promise<void> {
  let cursor: QueryDocumentSnapshot | null = null
  for (;;) {
    let query: Query = movimientosBancariosCollection()
    if (filtro.kind === 'categoria') query = query.where('categoriaId', '==', filtro.categoriaId)
    query = query.orderBy(FieldPath.documentId()).limit(WRITE_CHUNK)
    if (cursor) query = query.startAfter(cursor)
    const snap = await query.get()
    if (snap.empty) return
    const rows = snap.docs.map((doc) => movimientoParaRegla(doc.id, doc.data()))
    await visit(filtro.kind === 'sinCategoria' ? rows.filter((row) => !row.categoriaId) : rows)
    cursor = snap.docs[snap.docs.length - 1] ?? null
    if (snap.size < WRITE_CHUNK) return
  }
}

export async function guardarCategoriasEnBatch(updates: Array<{ id: string; categoriaId: string }>): Promise<void> {
  if (updates.length === 0) return
  const db = adminDb()
  const col = movimientosBancariosCollection()
  for (let i = 0; i < updates.length; i += WRITE_CHUNK) {
    const slice = updates.slice(i, i + WRITE_CHUNK)
    const batch = db.batch()
    for (const update of slice) batch.update(col.doc(update.id), { categoriaId: update.categoriaId })
    await batch.commit()
  }
}

/**
 * Reemplaza completo el tramo [desde, hasta] de una cuenta: borra lo que había
 * y guarda las filas tal cual vinieron del banco. La marca de agua se mueve al
 * final, así un corte a mitad de camino se repara solo en el próximo sync.
 */
export async function replaceMovimientosRango(input: {
  cuenta: { cuentaId: string; bancoNombre: BancoNombre }
  desde: string
  hasta: string
  rows: MovimientoBancarioMapped[]
  syncedBy: string
  primeraFechaCargada: string
  /**
   * El día en curso (`dia`) se reemplaza igual, pero no mueve la marca de agua:
   * esa marca es el tope de `anteriores` (hasta ayer). Si avanzara a hoy, mañana
   * el histórico no volvería a cerrar el día.
   */
  moverMarcaDeAgua?: boolean
}): Promise<{ eliminados: number; insertados: number; autoCategorizados: number }> {
  const { eliminados, anotaciones } = await deleteRango({
    cuentaId: input.cuenta.cuentaId,
    desde: input.desde,
    hasta: input.hasta,
  })
  const { insertados, autoCategorizados } = await insertRows({
    rows: input.rows,
    syncedBy: input.syncedBy,
    anotaciones,
  })

  if (input.moverMarcaDeAgua === false) {
    return { eliminados, insertados, autoCategorizados }
  }

  const ref = syncCollection().doc(input.cuenta.cuentaId)
  const now = FieldValue.serverTimestamp()
  await adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref)
    const patch = {
      cuentaId: input.cuenta.cuentaId,
      bancoNombre: input.cuenta.bancoNombre,
      ultimaFechaSincronizada: input.hasta,
      ultimoSyncAt: now,
      ultimoSyncPor: input.syncedBy,
      ultimoSyncFilas: input.rows.length,
      updatedAt: now,
    }
    if (existing.exists) {
      tx.update(ref, patch)
    } else {
      tx.set(ref, { ...patch, primeraFechaCargada: input.primeraFechaCargada, createdAt: now })
    }
  })

  return { eliminados, insertados, autoCategorizados }
}

export interface MovimientoListadoItem {
  id: string
  cuentaId: string
  bancoNombre: string
  fechaProceso: string
  descripcion: string
  contraparte: ContraparteGuardada | null
  customerCuit: string | null
  tipo: 'debito' | 'credito'
  montoCentavos: number
  categoriaId: string | null
  nota: string | null
}

export interface MovimientosListadoFiltro {
  cuentaId: string
  desde: string
  hasta: string
  tipo: 'debito' | 'credito' | null
  categoriaId: string | null
}

function rangoQuery(filtro: MovimientosListadoFiltro, tipo: 'debito' | 'credito' | null): Query {
  let query: Query = movimientosBancariosCollection().where('cuentaId', '==', filtro.cuentaId)
  if (tipo) query = query.where('tipo', '==', tipo)
  if (filtro.categoriaId) query = query.where('categoriaId', '==', filtro.categoriaId)
  query = query.where('fechaProceso', '>=', filtro.desde).where('fechaProceso', '<=', filtro.hasta)
  return query
}

function ordenado(filtro: MovimientosListadoFiltro): Query {
  return rangoQuery(filtro, filtro.tipo)
    .orderBy('fechaProceso', 'desc')
    .orderBy(FieldPath.documentId(), 'desc')
}

export function toListadoItem(id: string, data: DocumentData): MovimientoListadoItem {
  return {
    id,
    cuentaId: String(data.cuentaId ?? ''),
    bancoNombre: String(data.bancoNombre ?? ''),
    fechaProceso: String(data.fechaProceso ?? ''),
    descripcion: String(data.descripcion ?? ''),
    contraparte: vistaContraparte(data),
    customerCuit: typeof data.customerCuit === 'string' && data.customerCuit ? data.customerCuit : null,
    tipo: data.tipo === 'credito' ? 'credito' : 'debito',
    montoCentavos: typeof data.montoCentavos === 'number' ? data.montoCentavos : 0,
    categoriaId: typeof data.categoriaId === 'string' && data.categoriaId ? data.categoriaId : null,
    nota: typeof data.nota === 'string' && data.nota.trim() ? data.nota.trim() : null,
  }
}

export async function sumMovimientosCentavos(
  filtro: MovimientosListadoFiltro,
  tipo: 'debito' | 'credito',
): Promise<number> {
  if (filtro.tipo && filtro.tipo !== tipo) return 0
  const snap = await rangoQuery(filtro, tipo)
    .aggregate({ total: AggregateField.sum('montoCentavos') })
    .get()
  const total = snap.data().total
  return typeof total === 'number' ? total : 0
}

export async function countMovimientosFiltrados(filtro: MovimientosListadoFiltro): Promise<number> {
  const snap = await rangoQuery(filtro, filtro.tipo).count().get()
  return snap.data().count
}

export async function pageMovimientos(input: {
  filtro: MovimientosListadoFiltro
  offset: number
  limit: number
}): Promise<MovimientoListadoItem[]> {
  const snap = await ordenado(input.filtro).offset(input.offset).limit(input.limit).get()
  return snap.docs.map((doc) => toListadoItem(doc.id, doc.data()))
}

/** Recorre el rango en orden para un texto libre. Firestore no puede filtrar "contiene". */
export async function scanMovimientosPorTexto(input: {
  filtro: MovimientosListadoFiltro
  texto: string
  offset: number
  limit: number
}): Promise<{ total: number; entradasCentavos: number; salidasCentavos: number; items: MovimientoListadoItem[] }> {
  const needle = input.texto
  let total = 0
  let entradasCentavos = 0
  let salidasCentavos = 0
  const items: MovimientoListadoItem[] = []
  let cursor: QueryDocumentSnapshot | null = null

  for (;;) {
    let query = ordenado(input.filtro).limit(400)
    if (cursor) query = query.startAfter(cursor)
    const snap = await query.get()
    if (snap.empty) break

    for (const doc of snap.docs) {
      const data = doc.data()
      const item = toListadoItem(doc.id, data)
      const depositor = typeof data.depositorDescription === 'string' ? data.depositorDescription : null
      const haystack = [
        item.descripcion,
        item.contraparte?.nombre,
        item.contraparte?.cuit,
        item.customerCuit,
        depositor,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' ')
        .toLocaleLowerCase('es')
      if (!haystack.includes(needle)) continue
      if (item.tipo === 'credito') entradasCentavos += item.montoCentavos
      else salidasCentavos += item.montoCentavos
      if (total >= input.offset && items.length < input.limit) items.push(item)
      total += 1
    }

    cursor = snap.docs[snap.docs.length - 1] ?? null
    if (snap.size < 400) break
  }

  return { total, entradasCentavos, salidasCentavos, items }
}

export interface MovimientoCashflowRow {
  moneda: 'ARS' | 'USD'
  tipo: 'debito' | 'credito'
  montoCentavos: number
  categoriaId: string | null
  descripcion: string
  cuentaId: string
  bancoNombre: string
}

/** Filas de un día (todas las cuentas) con los campos que usa el cashflow. */
export async function listMovimientosCashflowDelDia(
  fechaProceso: string,
): Promise<MovimientoCashflowRow[]> {
  const snap = await movimientosBancariosCollection()
    .where('fechaProceso', '==', fechaProceso)
    .select('moneda', 'tipo', 'montoCentavos', 'categoriaId', 'descripcion', 'cuentaId', 'bancoNombre')
    .get()

  const rows: MovimientoCashflowRow[] = []
  for (const doc of snap.docs) {
    const data = doc.data()
    if (data.tipo !== 'credito' && data.tipo !== 'debito') continue
    if (typeof data.montoCentavos !== 'number') continue
    rows.push({
      moneda: data.moneda === 'USD' ? 'USD' : 'ARS',
      tipo: data.tipo,
      montoCentavos: data.montoCentavos,
      categoriaId:
        typeof data.categoriaId === 'string' && data.categoriaId ? data.categoriaId : null,
      descripcion: typeof data.descripcion === 'string' ? data.descripcion : '',
      cuentaId: typeof data.cuentaId === 'string' ? data.cuentaId : '',
      bancoNombre: typeof data.bancoNombre === 'string' ? data.bancoNombre : '',
    })
  }
  return rows
}
