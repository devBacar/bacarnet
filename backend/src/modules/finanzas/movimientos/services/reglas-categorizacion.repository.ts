import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'

export const REGLAS_CATEGORIZACION_COLLECTION = 'reglasCategorizacionMovimientos'

export interface ReglaCategorizacionDocument {
  /** Texto tal cual lo manda el banco, con espacios recortados. */
  descripcionExacta: string
  /** Igual a descripcionExacta; se guarda aparte por si a futuro se relaja la comparación. */
  descripcionKey: string
  categoriaId: string
  createdAt: Timestamp
  createdBy: string
  updatedAt?: Timestamp
  updatedBy?: string
}

export function reglasCategorizacionCollection() {
  return adminDb().collection(REGLAS_CATEGORIZACION_COLLECTION)
}

export async function listReglaCategorizacionDocuments(): Promise<
  Array<{ id: string; data: ReglaCategorizacionDocument }>
> {
  const snap = await reglasCategorizacionCollection().get()
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as ReglaCategorizacionDocument }))
}

export async function getReglaCategorizacionDocument(
  id: string,
): Promise<{ id: string; data: ReglaCategorizacionDocument } | null> {
  const snap = await reglasCategorizacionCollection().doc(id).get()
  if (!snap.exists) return null
  return { id: snap.id, data: snap.data() as ReglaCategorizacionDocument }
}

export async function findReglaPorDescripcion(
  descripcionKey: string,
): Promise<{ id: string; data: ReglaCategorizacionDocument } | null> {
  const snap = await reglasCategorizacionCollection().where('descripcionKey', '==', descripcionKey).limit(1).get()
  const doc = snap.docs[0]
  if (!doc) return null
  return { id: doc.id, data: doc.data() as ReglaCategorizacionDocument }
}

export async function createReglaCategorizacionDocument(input: {
  descripcionExacta: string
  descripcionKey: string
  categoriaId: string
  createdBy: string
}): Promise<string> {
  const ref = reglasCategorizacionCollection().doc()
  await ref.set({
    descripcionExacta: input.descripcionExacta,
    descripcionKey: input.descripcionKey,
    categoriaId: input.categoriaId,
    createdBy: input.createdBy,
    createdAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}

export async function updateReglaCategoria(input: { id: string; categoriaId: string; updatedBy: string }) {
  await reglasCategorizacionCollection().doc(input.id).update({
    categoriaId: input.categoriaId,
    updatedBy: input.updatedBy,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function deleteReglasDeCategoria(categoriaId: string): Promise<number> {
  const snap = await reglasCategorizacionCollection().where('categoriaId', '==', categoriaId).get()
  if (snap.empty) return 0
  const batch = adminDb().batch()
  for (const doc of snap.docs) batch.delete(doc.ref)
  await batch.commit()
  return snap.size
}
