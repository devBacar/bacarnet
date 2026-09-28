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
import { emparejarAnotaciones, huellaMovimiento, type AnotacionMovimiento } from '../domain/movimiento-huella.js'
import type { MovimientoBancarioSyncDocument } from '../domain/movimiento-bancario.types.js'
import { aplicarReglasAFilas, type ReglaCategorizacionAplicable } from '../domain/regla-categorizacion.js'
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

function anotacionDeDocumento(data: DocumentData): AnotacionMovimiento | null {
  const categoriaId = typeof data.categoriaId === 'string' && data.categoriaId ? data.categoriaId : null
  const nota = typeof data.nota === 'string' && data.nota.trim() ? data.nota.trim() : null
  if (!categoriaId && !nota) return null
  return { huella: huellaMovimiento(data), categoriaId, nota }
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
  return reglas
    .filter((regla) => regla.data.descripcionKey && regla.data.categoriaId)
    .map((regla) => ({ descripcionKey: regla.data.descripcionKey, categoriaId: regla.data.categoriaId }))
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

/** Pone la categoría a TODOS los movimientos (de cualquier cuenta) con esa descripción exacta. */
export async function asignarCategoriaPorDescripcion(input: {
  descripcionExacta: string
  categoriaId: string
}): Promise<number> {
  const query = movimientosBancariosCollection().where('descripcion', '==', input.descripcionExacta)
  return updateEnTandas(query, { categoriaId: input.categoriaId })
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
  contraparte: string | null
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

function toListadoItem(id: string, data: DocumentData): MovimientoListadoItem {
  return {
    id,
    cuentaId: String(data.cuentaId ?? ''),
    bancoNombre: String(data.bancoNombre ?? ''),
    fechaProceso: String(data.fechaProceso ?? ''),
    descripcion: String(data.descripcion ?? ''),
    contraparte: typeof data.depositorDescription === 'string' && data.depositorDescription ? data.depositorDescription : null,
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
      const haystack = [item.descripcion, item.contraparte, item.customerCuit]
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
