import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { normalizarNombre } from '../domain/normalizar-nombre.js'

export const PROVEEDORES_FINANCIEROS_COLLECTION = 'proveedoresFinancieros'

export interface ProveedorFinancieroDocument {
  nombre: string
  nombreNormalizado: string
  creadoPor: string
  createdAt: Timestamp
}

export interface ProveedorFinancieroVista {
  id: string
  nombre: string
  creadoPor: string
  createdAt: string | null
}

export async function listProveedoresFinancierosDocs(): Promise<
  Array<{ id: string; data: ProveedorFinancieroDocument }>
> {
  const snap = await adminDb().collection(PROVEEDORES_FINANCIEROS_COLLECTION).get()
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as ProveedorFinancieroDocument }))
}

export async function nombresNormalizadosProveedoresFinancieros(): Promise<Set<string>> {
  const rows = await listProveedoresFinancierosDocs()
  return new Set(rows.map((row) => row.data.nombreNormalizado).filter(Boolean))
}

export async function findProveedorFinancieroPorNombreNormalizado(
  nombreNormalizado: string,
): Promise<{ id: string; data: ProveedorFinancieroDocument } | null> {
  const snap = await adminDb()
    .collection(PROVEEDORES_FINANCIEROS_COLLECTION)
    .where('nombreNormalizado', '==', nombreNormalizado)
    .limit(1)
    .get()
  const doc = snap.docs[0]
  if (!doc) return null
  return { id: doc.id, data: doc.data() as ProveedorFinancieroDocument }
}

export async function crearProveedorFinancieroDoc(nombre: string, uid: string): Promise<string> {
  const ref = adminDb().collection(PROVEEDORES_FINANCIEROS_COLLECTION).doc()
  const doc: ProveedorFinancieroDocument = {
    nombre,
    nombreNormalizado: normalizarNombre(nombre),
    creadoPor: uid,
    createdAt: Timestamp.now(),
  }
  await ref.set(doc)
  return ref.id
}

export async function borrarProveedorFinancieroDoc(id: string): Promise<boolean> {
  const ref = adminDb().collection(PROVEEDORES_FINANCIEROS_COLLECTION).doc(id)
  const snap = await ref.get()
  if (!snap.exists) return false
  await ref.delete()
  return true
}
