import { FieldValue, type DocumentData } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import type {
  ChequeDireccion,
  ChequeDocument,
  ChequeEstado,
  ChequeImportRow,
  ChequeOrigen,
} from '../domain/cheque.types.js'

export const CHEQUES_COLLECTION = 'cheques'

const WRITE_CHUNK = 400

function collection() {
  return adminDb().collection(CHEQUES_COLLECTION)
}

export interface ChequeListadoItem {
  id: string
  numero: string
  tipo: string
  direccion: ChequeDireccion
  origen: string
  emisor: string
  emisorCuit: string
  fechaEmision: string
  fechaPago: string
  montoCentavos: number
  estado: ChequeEstado
  estadoBancario: string | null
  endosante: string | null
  bancoEmisor: string | null
  bancoEmisorCodigo: number | null
  cliente: string | null
  destinatario: string | null
  fechaRecibido: string | null
  fechaEntregado: string | null
  utilizado: boolean | null
  cmc7: string | null
  observaciones: string | null
  movimientoBancarioId: string | null
  movimientoCuentaId: string | null
  movimientoFecha: string | null
  fechaAcreditacion: string | null
}

function toListadoItem(id: string, data: DocumentData): ChequeListadoItem {
  return {
    id,
    numero: String(data.numero ?? ''),
    tipo: String(data.tipo ?? ''),
    direccion: (data.direccion ?? 'recibido') as ChequeDireccion,
    origen: (data.origen ?? 'tercero') as ChequeOrigen,
    emisor: String(data.emisor ?? ''),
    emisorCuit: String(data.emisorCuit ?? ''),
    fechaEmision: String(data.fechaEmision ?? ''),
    fechaPago: String(data.fechaPago ?? ''),
    montoCentavos: typeof data.montoCentavos === 'number' ? data.montoCentavos : 0,
    estado: data.estado ?? 'en_cartera',
    estadoBancario: typeof data.estadoBancario === 'string' ? data.estadoBancario : null,
    endosante: typeof data.endosante === 'string' ? data.endosante : null,
    bancoEmisor: typeof data.bancoEmisor === 'string' ? data.bancoEmisor : null,
    bancoEmisorCodigo: typeof data.bancoEmisorCodigo === 'number' ? data.bancoEmisorCodigo : null,
    cliente: typeof data.cliente === 'string' ? data.cliente : null,
    destinatario: typeof data.destinatario === 'string' ? data.destinatario : null,
    fechaRecibido: typeof data.fechaRecibido === 'string' ? data.fechaRecibido : null,
    fechaEntregado: typeof data.fechaEntregado === 'string' ? data.fechaEntregado : null,
    utilizado: typeof data.utilizado === 'boolean' ? data.utilizado : null,
    cmc7: typeof data.cmc7 === 'string' ? data.cmc7 : null,
    observaciones: typeof data.observaciones === 'string' ? data.observaciones : null,
    movimientoBancarioId: typeof data.movimientoBancarioId === 'string' ? data.movimientoBancarioId : null,
    movimientoCuentaId: typeof data.movimientoCuentaId === 'string' ? data.movimientoCuentaId : null,
    movimientoFecha: typeof data.movimientoFecha === 'string' ? data.movimientoFecha : null,
    fechaAcreditacion: typeof data.fechaAcreditacion === 'string' ? data.fechaAcreditacion : null,
  }
}

export interface ChequesFiltro {
  direccion: ChequeDireccion | null
  origen: ChequeOrigen | null
  estado: ChequeEstado | null
  tipo: 'echeq' | 'fisico' | null
  desde: string | null
  hasta: string | null
  vinculacion: 'vinculado' | 'sin_vincular' | null
  q: string | null
}

function applyFiltro(base: FirebaseFirestore.Query, filtro: ChequesFiltro): FirebaseFirestore.Query {
  let query = base
  if (filtro.direccion) query = query.where('direccion', '==', filtro.direccion)
  if (filtro.origen) query = query.where('origen', '==', filtro.origen)
  if (filtro.estado) query = query.where('estado', '==', filtro.estado)
  if (filtro.tipo) query = query.where('tipo', '==', filtro.tipo)
  if (filtro.desde) query = query.where('fechaPago', '>=', filtro.desde)
  if (filtro.hasta) query = query.where('fechaPago', '<=', filtro.hasta)
  return query
}

function matchVinculacion(data: FirebaseFirestore.DocumentData, vinculacion: 'vinculado' | 'sin_vincular'): boolean {
  return vinculacion === 'vinculado' ? Boolean(data.movimientoBancarioId) : !data.movimientoBancarioId
}

function matchBusqueda(data: FirebaseFirestore.DocumentData, q: string): boolean {
  const norm = q.toLowerCase()
  const fields = [data.numero, data.emisor, data.emisorCuit, data.cliente, data.destinatario]
  return fields.some((f) => typeof f === 'string' && f.toLowerCase().includes(norm))
}

async function loadFiltradoInMemory(filtro: ChequesFiltro): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const query = applyFiltro(collection(), filtro).orderBy('fechaPago', 'asc')
  const snap = await query.get()
  return snap.docs.filter((doc) => {
    const data = doc.data()
    if (filtro.vinculacion && !matchVinculacion(data, filtro.vinculacion)) return false
    if (filtro.q && !matchBusqueda(data, filtro.q)) return false
    return true
  })
}

export async function countChequesFiltrados(filtro: ChequesFiltro): Promise<number> {
  if (filtro.vinculacion || filtro.q) return (await loadFiltradoInMemory(filtro)).length
  const query = applyFiltro(collection(), filtro)
  const snap = await query.count().get()
  return snap.data().count
}

export async function pageCheques(input: {
  filtro: ChequesFiltro
  offset: number
  limit: number
}): Promise<ChequeListadoItem[]> {
  if (input.filtro.vinculacion || input.filtro.q) {
    const docs = await loadFiltradoInMemory(input.filtro)
    return docs.slice(input.offset, input.offset + input.limit).map((doc) => toListadoItem(doc.id, doc.data()))
  }
  const query = applyFiltro(collection(), input.filtro)
    .orderBy('fechaPago', 'asc')
    .offset(input.offset)
    .limit(input.limit)
  const snap = await query.get()
  return snap.docs.map((doc) => toListadoItem(doc.id, doc.data()))
}

export async function sumChequesCentavos(filtro: ChequesFiltro): Promise<number> {
  if (filtro.vinculacion || filtro.q) {
    const docs = await loadFiltradoInMemory(filtro)
    return docs.reduce((sum, doc) => {
      const v = doc.data().montoCentavos
      return sum + (typeof v === 'number' ? v : 0)
    }, 0)
  }
  const query = applyFiltro(collection(), filtro)
  const { AggregateField } = await import('firebase-admin/firestore')
  const snap = await query.aggregate({ total: AggregateField.sum('montoCentavos') }).get()
  const total = snap.data().total
  return typeof total === 'number' ? total : 0
}

export async function sumChequesPorDireccion(filtro: Omit<ChequesFiltro, 'direccion'>): Promise<{
  recibidosCentavos: number
  emitidosCentavos: number
}> {
  if (filtro.vinculacion || filtro.q) {
    const [recDocs, emDocs] = await Promise.all([
      loadFiltradoInMemory({ ...filtro, direccion: 'recibido' }),
      loadFiltradoInMemory({ ...filtro, direccion: 'emitido' }),
    ])
    const sumDocs = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) =>
      docs.reduce((s, d) => { const v = d.data().montoCentavos; return s + (typeof v === 'number' ? v : 0) }, 0)
    return { recibidosCentavos: sumDocs(recDocs), emitidosCentavos: sumDocs(emDocs) }
  }
  const { AggregateField } = await import('firebase-admin/firestore')
  const [recSnap, emSnap] = await Promise.all([
    applyFiltro(collection(), { ...filtro, direccion: 'recibido' })
      .aggregate({ total: AggregateField.sum('montoCentavos') })
      .get(),
    applyFiltro(collection(), { ...filtro, direccion: 'emitido' })
      .aggregate({ total: AggregateField.sum('montoCentavos') })
      .get(),
  ])
  const rec = recSnap.data().total
  const em = emSnap.data().total
  return {
    recibidosCentavos: typeof rec === 'number' ? rec : 0,
    emitidosCentavos: typeof em === 'number' ? em : 0,
  }
}

export function chequeDocId(direccion: ChequeDireccion, numero: string): string {
  return `${direccion}_${numero}`
}

const GETALL_LIMIT = 500

export async function findExistingNumeros(
  direccion: ChequeDireccion,
  numeros: string[],
): Promise<Set<string>> {
  const existing = new Set<string>()
  const refs = numeros.map((n) => collection().doc(chequeDocId(direccion, n)))
  for (let i = 0; i < refs.length; i += GETALL_LIMIT) {
    const batch = refs.slice(i, i + GETALL_LIMIT)
    const snaps = await adminDb().getAll(...batch)
    for (let j = 0; j < snaps.length; j++) {
      if (snaps[j].exists) existing.add(numeros[i + j])
    }
  }
  return existing
}

export async function insertCheques(input: {
  rows: ChequeImportRow[]
  createdBy: string
}): Promise<number> {
  const db = adminDb()
  const col = collection()
  let insertados = 0
  for (let i = 0; i < input.rows.length; i += WRITE_CHUNK) {
    const slice = input.rows.slice(i, i + WRITE_CHUNK)
    const batch = db.batch()
    for (const row of slice) {
      const doc: Omit<ChequeDocument, 'createdAt' | 'updatedAt'> & {
        createdAt: FirebaseFirestore.FieldValue
        updatedAt: FirebaseFirestore.FieldValue
      } = {
        ...row,
        createdBy: input.createdBy,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }
      batch.set(col.doc(chequeDocId(row.direccion, row.numero)), doc)
    }
    await batch.commit()
    insertados += slice.length
  }
  return insertados
}

export async function upsertCheques(input: {
  rows: ChequeImportRow[]
  createdBy: string
}): Promise<number> {
  const db = adminDb()
  const col = collection()
  let actualizados = 0
  for (let i = 0; i < input.rows.length; i += WRITE_CHUNK) {
    const slice = input.rows.slice(i, i + WRITE_CHUNK)
    const batch = db.batch()
    for (const row of slice) {
      const { fechaAcreditacion, ...rest } = row
      const data: Record<string, unknown> = {
        ...rest,
        updatedAt: FieldValue.serverTimestamp(),
      }
      if (fechaAcreditacion) data.fechaAcreditacion = fechaAcreditacion
      batch.set(col.doc(chequeDocId(row.direccion, row.numero)), data, { merge: true })
    }
    await batch.commit()
    actualizados += slice.length
  }
  return actualizados
}

export async function getChequeById(id: string): Promise<ChequeListadoItem | null> {
  const snap = await collection().doc(id).get()
  if (!snap.exists) return null
  return toListadoItem(snap.id, snap.data()!)
}

export async function updateChequeEstado(input: {
  id: string
  estado: ChequeEstado
}): Promise<void> {
  await collection().doc(input.id).update({
    estado: input.estado,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

/**
 * Endoso desde Hoy: el cheque recibido se usó para pagarle a otra persona.
 * Escribe solo `utilizado`, `destinatario` y `updatedAt`.
 * No toca endosante, estado ni ningún otro campo.
 */
export async function marcarChequeEndosado(input: {
  id: string
  destinatario: string
}): Promise<void> {
  const destinatario = input.destinatario.trim()
  if (!destinatario) throw new Error('Falta a quién se endosa el cheque')
  await collection().doc(input.id).update({
    utilizado: true,
    destinatario,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function listChequesSinVincular(
  direccion: ChequeDireccion,
): Promise<{ id: string; numero: string; montoCentavos: number; fechaEmision: string; fechaPago: string; emisor: string; cliente: string | null; destinatario: string | null }[]> {
  const snap = await collection()
    .where('direccion', '==', direccion)
    .get()

  return snap.docs
    .filter((doc) => {
      const data = doc.data()
      return !data.movimientoBancarioId
    })
    .map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        numero: String(data.numero ?? ''),
        montoCentavos: typeof data.montoCentavos === 'number' ? data.montoCentavos : 0,
        fechaEmision: String(data.fechaEmision ?? ''),
        fechaPago: String(data.fechaPago ?? ''),
        emisor: String(data.emisor ?? ''),
        cliente: typeof data.cliente === 'string' ? data.cliente : null,
        destinatario: typeof data.destinatario === 'string' ? data.destinatario : null,
      }
    })
}

export async function vincularChequeConMovimiento(input: {
  chequeId: string
  movimientoBancarioId: string
  movimientoCuentaId: string
  movimientoFecha: string
  fechaAcreditacion: string | null
}): Promise<void> {
  await collection().doc(input.chequeId).update({
    movimientoBancarioId: input.movimientoBancarioId,
    movimientoCuentaId: input.movimientoCuentaId,
    movimientoFecha: input.movimientoFecha,
    ...(input.fechaAcreditacion != null ? { fechaAcreditacion: input.fechaAcreditacion } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function resumenDiario(fecha: string): Promise<{
  cantidadACobrar: number
  totalACobrarCentavos: number
}> {
  const snap = await collection()
    .where('direccion', '==', 'recibido')
    .where('estado', '==', 'en_cartera')
    .where('fechaPago', '==', fecha)
    .get()
  let totalACobrarCentavos = 0
  for (const doc of snap.docs) {
    const data = doc.data()
    if (typeof data.montoCentavos === 'number') totalACobrarCentavos += data.montoCentavos
  }
  return { cantidadACobrar: snap.size, totalACobrarCentavos }
}

export async function resumenProximos(desdeFecha: string): Promise<{
  cantidadACobrar: number
  totalACobrarCentavos: number
}> {
  const snap = await collection()
    .where('direccion', '==', 'recibido')
    .where('estado', '==', 'en_cartera')
    .where('fechaPago', '>', desdeFecha)
    .get()
  let totalACobrarCentavos = 0
  for (const doc of snap.docs) {
    const data = doc.data()
    if (typeof data.montoCentavos === 'number') totalACobrarCentavos += data.montoCentavos
  }
  return { cantidadACobrar: snap.size, totalACobrarCentavos }
}
