import { FieldPath, FieldValue, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import type { TipoReglaCategorizacion } from '../domain/regla-categorizacion.js'

export const REGLAS_CATEGORIZACION_COLLECTION = 'reglasCategorizacionMovimientos'

const WRITE_CHUNK = 400

export interface ReglaCategorizacionDocument {
  /**
   * Ausente en documentos viejos: se lee como `descripcion`.
   * `codigoIb` y `cuit` no usan los campos de descripción.
   */
  tipo?: TipoReglaCategorizacion
  /** Texto tal cual lo manda el banco, con espacios recortados. */
  descripcionExacta?: string
  /** Igual a descripcionExacta; se guarda aparte por si a futuro se relaja la comparación. */
  descripcionKey?: string
  codigoIb?: string
  codigoIbKey?: string
  /** Solo dígitos, 11. */
  cuit?: string
  cuitKey?: string
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

function campoClave(tipo: TipoReglaCategorizacion): 'descripcionKey' | 'codigoIbKey' | 'cuitKey' {
  if (tipo === 'codigoIb') return 'codigoIbKey'
  if (tipo === 'cuit') return 'cuitKey'
  return 'descripcionKey'
}

export async function findReglaPorTipoYClave(
  tipo: TipoReglaCategorizacion,
  clave: string,
): Promise<{ id: string; data: ReglaCategorizacionDocument } | null> {
  const snap = await reglasCategorizacionCollection().where(campoClave(tipo), '==', clave).limit(5).get()
  for (const doc of snap.docs) {
    const data = doc.data() as ReglaCategorizacionDocument
    const tipoDoc: TipoReglaCategorizacion =
      data.tipo === 'codigoIb' || data.tipo === 'cuit' ? data.tipo : 'descripcion'
    if (tipoDoc === tipo) return { id: doc.id, data }
  }
  return null
}

export async function createReglaCategorizacionDocument(input: {
  tipo: TipoReglaCategorizacion
  valor: string
  clave: string
  categoriaId: string
  createdBy: string
}): Promise<string> {
  const ref = reglasCategorizacionCollection().doc()
  const data: Record<string, unknown> = {
    tipo: input.tipo,
    categoriaId: input.categoriaId,
    createdBy: input.createdBy,
    createdAt: FieldValue.serverTimestamp(),
  }
  if (input.tipo === 'codigoIb') {
    data.codigoIb = input.valor
    data.codigoIbKey = input.clave
  } else if (input.tipo === 'cuit') {
    data.cuit = input.valor
    data.cuitKey = input.clave
  } else {
    data.descripcionExacta = input.valor
    data.descripcionKey = input.clave
  }
  await ref.set(data)
  return ref.id
}

export async function countReglasPorCategoria(categoriaId: string): Promise<number> {
  const snap = await reglasCategorizacionCollection().where('categoriaId', '==', categoriaId).count().get()
  return snap.data().count
}

/** Cambia la categoría de todas las reglas que apuntaban a `origenId`. */
export async function moverReglasDeCategoria(origenId: string, destinoId: string): Promise<number> {
  const db = adminDb()
  let movidas = 0
  let cursor: QueryDocumentSnapshot | null = null
  for (;;) {
    let page = reglasCategorizacionCollection()
      .where('categoriaId', '==', origenId)
      .orderBy(FieldPath.documentId())
      .limit(WRITE_CHUNK)
    if (cursor) page = page.startAfter(cursor)
    const snap = await page.get()
    if (snap.empty) return movidas
    const batch = db.batch()
    for (const doc of snap.docs) {
      batch.update(doc.ref, { categoriaId: destinoId, updatedAt: FieldValue.serverTimestamp() })
    }
    await batch.commit()
    movidas += snap.size
    cursor = snap.docs[snap.docs.length - 1] ?? null
    if (snap.size < WRITE_CHUNK) return movidas
  }
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
