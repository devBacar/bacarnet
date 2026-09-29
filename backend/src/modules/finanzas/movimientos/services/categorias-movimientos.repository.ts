import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'

export const CATEGORIAS_MOVIMIENTOS_COLLECTION = 'categoriasMovimientos'

export interface CategoriaMovimientoDocument {
  nombre: string
  nombreKey: string
  color: string | null
  /** Ausente en documentos viejos: se lee como null. */
  grupo?: string | null
  createdAt: Timestamp
  createdBy: string
}

export function categoriasMovimientosCollection() {
  return adminDb().collection(CATEGORIAS_MOVIMIENTOS_COLLECTION)
}

export async function listCategoriaMovimientoDocuments(): Promise<
  Array<{ id: string; data: CategoriaMovimientoDocument }>
> {
  const snap = await categoriasMovimientosCollection().get()
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as CategoriaMovimientoDocument }))
}

export async function getCategoriaMovimientoDocument(
  id: string,
): Promise<{ id: string; data: CategoriaMovimientoDocument } | null> {
  const snap = await categoriasMovimientosCollection().doc(id).get()
  if (!snap.exists) return null
  return { id: snap.id, data: snap.data() as CategoriaMovimientoDocument }
}

export async function createCategoriaMovimientoDocument(input: {
  nombre: string
  nombreKey: string
  color: string | null
  grupo?: string | null
  createdBy: string
}): Promise<string> {
  const ref = categoriasMovimientosCollection().doc()
  await ref.set({
    nombre: input.nombre,
    nombreKey: input.nombreKey,
    color: input.color,
    grupo: input.grupo ?? null,
    createdBy: input.createdBy,
    createdAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}

export async function updateCategoriaMovimientoDocument(
  id: string,
  patch: Partial<Pick<CategoriaMovimientoDocument, 'nombre' | 'nombreKey' | 'color' | 'grupo'>>,
): Promise<void> {
  await categoriasMovimientosCollection().doc(id).update(patch)
}

export async function deleteCategoriaMovimientoDocument(id: string): Promise<void> {
  await categoriasMovimientosCollection().doc(id).delete()
}
