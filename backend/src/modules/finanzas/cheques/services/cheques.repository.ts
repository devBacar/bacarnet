import {
  FieldValue,
  Timestamp,
  type Query,
} from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import type {
  ChequeDireccion,
  ChequeDocument,
  ChequeEstado,
  HistorialEstadoDocument,
  normalizeChequeDireccion,
} from '../domain/cheque.types.js'
import { buildHistorialEstadoEntry } from '../domain/cheque.transitions.js'

const CHEQUES_COLLECTION = 'cheques'
const HISTORIAL_SUB = 'historialEstados'

export function chequesCollection() {
  return adminDb().collection(CHEQUES_COLLECTION)
}

export async function appendHistorialAndUpdateCheque(input: {
  chequeId: string
  estadoAnterior: ChequeEstado | null
  estadoNuevo: ChequeEstado
  usuario: string
  nota: string | null
  patch: Partial<
    Pick<
      ChequeDocument,
      | 'endosadoA'
      | 'vendidoA'
      | 'vendidoConResponsabilidad'
      | 'motivoRechazo'
      | 'compromisoPagoId'
      | 'cobroOrigenId'
    >
  >
}): Promise<void> {
  const ref = chequesCollection().doc(input.chequeId)
  const historialEntry = buildHistorialEstadoEntry({
    estadoAnterior: input.estadoAnterior,
    estadoNuevo: input.estadoNuevo,
    usuario: input.usuario,
    nota: input.nota,
  })

  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) {
      throw new Error('Cheque no encontrado')
    }

    const historialRef = ref.collection(HISTORIAL_SUB).doc()
    tx.set(historialRef, {
      ...historialEntry,
      fecha: FieldValue.serverTimestamp(),
    })

    tx.update(ref, {
      estadoActual: input.estadoNuevo,
      updatedAt: FieldValue.serverTimestamp(),
      ...input.patch,
    })
  })
}

export async function createChequeWithHistorial(input: {
  chequeId: string
  doc: Omit<ChequeDocument, 'createdAt' | 'updatedAt'>
  usuario: string
  nota: string | null
}): Promise<void> {
  const ref = chequesCollection().doc(input.chequeId)
  const now = FieldValue.serverTimestamp()
  const historialEntry = buildHistorialEstadoEntry({
    estadoAnterior: null,
    estadoNuevo: input.doc.estadoActual,
    usuario: input.usuario,
    nota: input.nota,
  })

  await adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref)
    if (existing.exists) {
      throw new Error('Ya existe un cheque con ese id')
    }

    tx.set(ref, {
      ...input.doc,
      createdAt: now,
      updatedAt: now,
    })

    const historialRef = ref.collection(HISTORIAL_SUB).doc()
    tx.set(historialRef, {
      ...historialEntry,
      fecha: now,
    })
  })
}

export async function getChequeDocument(chequeId: string): Promise<ChequeDocument | null> {
  const snap = await chequesCollection().doc(chequeId).get()
  if (!snap.exists) return null
  return snap.data() as ChequeDocument
}

export async function listHistorial(chequeId: string): Promise<
  Array<{ id: string; data: HistorialEstadoDocument }>
> {
  const snap = await chequesCollection()
    .doc(chequeId)
    .collection(HISTORIAL_SUB)
    .orderBy('fecha', 'desc')
    .get()
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as HistorialEstadoDocument }))
}

export interface ListChequesFilters {
  direccion?: ChequeDireccion
  estado?: ChequeEstado
  bancoEmisor?: string
  fechaPagoDesde?: Date
  fechaPagoHasta?: Date
}

export async function listChequeDocuments(
  filters: ListChequesFilters,
): Promise<Array<{ id: string; data: ChequeDocument }>> {
  let q: Query = chequesCollection()
  if (filters.estado) {
    q = q.where('estadoActual', '==', filters.estado)
  }
  if (filters.bancoEmisor?.trim()) {
    q = q.where('bancoEmisor', '==', filters.bancoEmisor.trim())
  }

  const snap = await q.get()
  let rows = snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as ChequeDocument }))

  if (filters.direccion) {
    rows = rows.filter(
      (row) => normalizeChequeDireccion(row.data.direccion) === filters.direccion,
    )
  }

  if (filters.fechaPagoDesde || filters.fechaPagoHasta) {
    const desde = filters.fechaPagoDesde?.getTime() ?? Number.NEGATIVE_INFINITY
    const hasta = filters.fechaPagoHasta?.getTime() ?? Number.POSITIVE_INFINITY
    rows = rows.filter((row) => {
      const ts = row.data.fechaPago
      const ms = ts instanceof Timestamp ? ts.toMillis() : 0
      return ms >= desde && ms <= hasta
    })
  }

  rows.sort((a, b) => {
    const am = a.data.fechaPago instanceof Timestamp ? a.data.fechaPago.toMillis() : 0
    const bm = b.data.fechaPago instanceof Timestamp ? b.data.fechaPago.toMillis() : 0
    return bm - am
  })

  return rows
}

export function parseDateInput(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const d = new Date(value.trim())
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function timestampFromDate(date: Date): Timestamp {
  return Timestamp.fromDate(date)
}
