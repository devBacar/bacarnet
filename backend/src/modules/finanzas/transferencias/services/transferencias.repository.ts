import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { COMPROMISOS_COLLECTION } from '../../agenda/services/agenda.repository.js'
import type {
  TransferenciaConfeccionadaDocument,
  TransferenciaHistorialDocument,
  TransferenciaHistorialOrigen,
} from '../domain/transferencia.types.js'

export const TRANSFERENCIAS_COLLECTION = 'transferenciasConfeccionadas'
const HISTORIAL_SUB = 'historialEstados'

export function transferenciasCollection() {
  return adminDb().collection(TRANSFERENCIAS_COLLECTION)
}

export async function getTransferenciaDocument(
  id: string,
): Promise<{ id: string; data: TransferenciaConfeccionadaDocument } | null> {
  const snap = await transferenciasCollection().doc(id).get()
  if (!snap.exists) return null
  return { id: snap.id, data: snap.data() as TransferenciaConfeccionadaDocument }
}

export async function createTransferenciaWithHistorial(input: {
  id: string
  doc: Omit<TransferenciaConfeccionadaDocument, 'createdAt' | 'updatedAt'>
  historial: {
    estadoAnterior: string | null
    estadoNuevo: string
    origen: TransferenciaHistorialOrigen
    nota: string | null
  }
}): Promise<void> {
  const ref = transferenciasCollection().doc(input.id)
  const now = FieldValue.serverTimestamp()

  await adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref)
    if (existing.exists) throw new Error('Transferencia ya existe')

    tx.set(ref, {
      ...input.doc,
      createdAt: now,
      updatedAt: now,
    })

    tx.set(ref.collection(HISTORIAL_SUB).doc(), {
      estadoAnterior: input.historial.estadoAnterior,
      estadoNuevo: input.historial.estadoNuevo,
      origen: input.historial.origen,
      nota: input.historial.nota,
      fecha: now,
    })
  })
}

export async function appendTransferenciaHistorial(input: {
  transferenciaId: string
  historial: {
    estadoAnterior: string | null
    estadoNuevo: string
    origen: TransferenciaHistorialOrigen
    nota: string | null
  }
  patch: Partial<TransferenciaConfeccionadaDocument>
}): Promise<void> {
  const ref = transferenciasCollection().doc(input.transferenciaId)
  const now = FieldValue.serverTimestamp()

  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new Error('Transferencia no encontrada')

    tx.set(ref.collection(HISTORIAL_SUB).doc(), {
      ...input.historial,
      fecha: now,
    })

    tx.update(ref, {
      ...input.patch,
      updatedAt: now,
    })
  })
}

export async function listTransferenciasConfeccionadas(): Promise<
  Array<{ id: string; data: TransferenciaConfeccionadaDocument }>
> {
  const snap = await transferenciasCollection().get()
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as TransferenciaConfeccionadaDocument }))
}

export async function listTransferenciaHistorial(transferenciaId: string) {
  const snap = await transferenciasCollection()
    .doc(transferenciaId)
    .collection(HISTORIAL_SUB)
    .orderBy('fecha', 'desc')
    .get()
  return snap.docs.map((d) => ({ id: d.id, data: d.data() as TransferenciaHistorialDocument }))
}

export function timestampNow(): Timestamp {
  return Timestamp.now()
}

/**
 * Marca la transferencia como cancelada en BacarNet y reabre el compromiso.
 * No llama a Interbanking. No borra transferenciaConfeccionadaId.
 */
export async function cancelarTransferenciaYReabrirCompromiso(input: {
  transferenciaId: string
  compromisoId: string
  estadoAnteriorTransferencia: string
  estadoAnteriorCompromiso: string
  nota: string
  usuarioUid: string
}): Promise<void> {
  const transferenciaRef = transferenciasCollection().doc(input.transferenciaId)
  const compromisoRef = adminDb().collection(COMPROMISOS_COLLECTION).doc(input.compromisoId)
  const now = FieldValue.serverTimestamp()

  await adminDb().runTransaction(async (tx) => {
    const transferenciaSnap = await tx.get(transferenciaRef)
    if (!transferenciaSnap.exists) throw new Error('Transferencia no encontrada')
    const compromisoSnap = await tx.get(compromisoRef)
    if (!compromisoSnap.exists) throw new Error('Compromiso no encontrado')

    tx.update(transferenciaRef, {
      estado: 'cancelada',
      updatedAt: now,
    })
    tx.set(transferenciaRef.collection(HISTORIAL_SUB).doc(), {
      estadoAnterior: input.estadoAnteriorTransferencia,
      estadoNuevo: 'cancelada',
      origen: 'usuario' satisfies TransferenciaHistorialOrigen,
      nota: input.nota,
      fecha: now,
    })

    tx.update(compromisoRef, {
      estado: 'pendiente',
      updatedAt: now,
    })
    tx.set(compromisoRef.collection(HISTORIAL_SUB).doc(), {
      estadoAnterior: input.estadoAnteriorCompromiso,
      estadoNuevo: 'pendiente',
      usuario: input.usuarioUid,
      nota: input.nota,
      fecha: now,
    })
  })
}
