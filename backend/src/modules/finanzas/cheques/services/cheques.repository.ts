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
  endosante: string | null
  bancoEmisor: string | null
  cliente: string | null
  destinatario: string | null
  fechaRecibido: string | null
  fechaEntregado: string | null
  utilizado: boolean | null
  cmc7: string | null
  observaciones: string | null
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
    endosante: typeof data.endosante === 'string' ? data.endosante : null,
    bancoEmisor: typeof data.bancoEmisor === 'string' ? data.bancoEmisor : null,
    cliente: typeof data.cliente === 'string' ? data.cliente : null,
    destinatario: typeof data.destinatario === 'string' ? data.destinatario : null,
    fechaRecibido: typeof data.fechaRecibido === 'string' ? data.fechaRecibido : null,
    fechaEntregado: typeof data.fechaEntregado === 'string' ? data.fechaEntregado : null,
    utilizado: typeof data.utilizado === 'boolean' ? data.utilizado : null,
    cmc7: typeof data.cmc7 === 'string' ? data.cmc7 : null,
    observaciones: typeof data.observaciones === 'string' ? data.observaciones : null,
  }
}

export interface ChequesFiltro {
  direccion: ChequeDireccion | null
  origen: ChequeOrigen | null
  estado: ChequeEstado | null
  tipo: 'echeq' | 'fisico' | null
  desde: string | null
  hasta: string | null
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

export async function countChequesFiltrados(filtro: ChequesFiltro): Promise<number> {
  const query = applyFiltro(collection(), filtro)
  const snap = await query.count().get()
  return snap.data().count
}

export async function pageCheques(input: {
  filtro: ChequesFiltro
  offset: number
  limit: number
}): Promise<ChequeListadoItem[]> {
  const query = applyFiltro(collection(), input.filtro)
    .orderBy('fechaPago', 'asc')
    .offset(input.offset)
    .limit(input.limit)
  const snap = await query.get()
  return snap.docs.map((doc) => toListadoItem(doc.id, doc.data()))
}

export async function sumChequesCentavos(filtro: ChequesFiltro): Promise<number> {
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

const FIRESTORE_IN_LIMIT = 30

export async function findExistingNumeros(
  direccion: ChequeDireccion,
  numeros: string[],
): Promise<Set<string>> {
  const existing = new Set<string>()
  for (let i = 0; i < numeros.length; i += FIRESTORE_IN_LIMIT) {
    const batch = numeros.slice(i, i + FIRESTORE_IN_LIMIT)
    const snap = await collection()
      .where('direccion', '==', direccion)
      .where('numero', 'in', batch)
      .select()
      .get()
    for (const doc of snap.docs) {
      const num = doc.data().numero
      if (num) existing.add(String(num))
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
      batch.set(col.doc(), doc)
    }
    await batch.commit()
    insertados += slice.length
  }
  return insertados
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
