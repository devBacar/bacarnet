import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { COMPROMISOS_COLLECTION } from '../../agenda/services/agenda.repository.js'
import type {
  TransferenciaConfeccionadaDocument,
  TransferenciaHistorialDocument,
  TransferenciaHistorialOrigen,
} from '../domain/transferencia.types.js'

export const TRANSFERENCIAS_COLLECTION = 'transferenciasConfeccionadas'
export const IDEMPOTENCIA_COLLECTION = 'transferenciasIdempotencia'
const HISTORIAL_SUB = 'historialEstados'

function idempotenciaCollection() {
  return adminDb().collection(IDEMPOTENCIA_COLLECTION)
}

export type IdempotenciaClaim =
  | { kind: 'start' }
  | { kind: 'replay'; transferenciaId: string }
  | { kind: 'pending' }

/** Reserva la clave antes de llamar al proveedor. El id se completa al guardar la transferencia. */
export async function beginIdempotentConfeccion(key: string): Promise<IdempotenciaClaim> {
  const ref = idempotenciaCollection().doc(key)
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists) {
      const id = snap.get('transferenciaId')
      if (typeof id === 'string' && id.trim()) return { kind: 'replay', transferenciaId: id }
      return { kind: 'pending' }
    }
    tx.set(ref, { transferenciaId: null, createdAt: FieldValue.serverTimestamp() })
    return { kind: 'start' }
  })
}

export async function abortIdempotentConfeccion(key: string): Promise<void> {
  await idempotenciaCollection().doc(key).delete()
}

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
  const idempotencyKey = input.doc.idempotencyKey?.trim() || ''
  const claimRef = idempotencyKey ? idempotenciaCollection().doc(idempotencyKey) : null

  await adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(ref)
    const claimSnap = claimRef ? await tx.get(claimRef) : null
    if (existing.exists) throw new Error('Transferencia ya existe')
    if (claimSnap?.exists) {
      const currentId = claimSnap.get('transferenciaId')
      if (typeof currentId === 'string' && currentId && currentId !== input.id) {
        throw new Error('Esta transferencia ya fue confeccionada')
      }
    }

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

    if (claimRef) {
      tx.set(claimRef, { transferenciaId: input.id, updatedAt: now }, { merge: true })
    }
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

/** Cancelación local de una transferencia directa, sin compromiso que reabrir. */
export async function marcarTransferenciaCancelada(input: {
  transferenciaId: string
  estadoAnterior: string
  nota: string
}): Promise<void> {
  const transferenciaRef = transferenciasCollection().doc(input.transferenciaId)
  const now = FieldValue.serverTimestamp()

  await adminDb().runTransaction(async (tx) => {
    const transferenciaSnap = await tx.get(transferenciaRef)
    if (!transferenciaSnap.exists) throw new Error('Transferencia no encontrada')

    tx.update(transferenciaRef, {
      estado: 'cancelada',
      updatedAt: now,
    })
    tx.set(transferenciaRef.collection(HISTORIAL_SUB).doc(), {
      estadoAnterior: input.estadoAnterior,
      estadoNuevo: 'cancelada',
      origen: 'usuario' satisfies TransferenciaHistorialOrigen,
      nota: input.nota,
      fecha: now,
    })
  })
}
