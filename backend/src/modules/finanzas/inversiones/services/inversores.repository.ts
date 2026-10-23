import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import {
  CONFIG_INVERSIONES_DEFAULT,
  type ConfigInversiones,
  type InversionDocumentBase,
  type InversorDatos,
} from '../domain/inversion.types.js'
import { configConDefaults } from '../domain/validar.js'

export const INVERSORES_COLLECTION = 'inversores'
export const INVERSIONES_COLLECTION = 'inversiones'
export const FINANZAS_CONFIG_COLLECTION = 'finanzasConfig'
export const CONFIG_INVERSIONES_DOC = 'inversiones'

export type EstadoInversor = 'activo' | 'inactivo'

export interface InversorDocument extends InversorDatos {
  estado: EstadoInversor
  /** Nombre en minúsculas y sin acentos, para buscar y evitar duplicados. */
  nombreNormalizado: string
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
  updatedBy: string
}

export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function isoDe(ts: unknown): string | null {
  return ts instanceof Timestamp ? ts.toDate().toISOString() : null
}

export async function listInversoresDocs(): Promise<Array<{ id: string; data: InversorDocument }>> {
  const snap = await adminDb().collection(INVERSORES_COLLECTION).get()
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as InversorDocument }))
}

export async function getInversorDoc(id: string): Promise<InversorDocument | null> {
  const snap = await adminDb().collection(INVERSORES_COLLECTION).doc(id).get()
  return snap.exists ? (snap.data() as InversorDocument) : null
}

/** Con `id` fijo usa create(): si ya existe (otro pedido lo creó en el medio) devuelve ese mismo id. */
export async function crearInversorDoc(datos: InversorDatos, uid: string, id?: string): Promise<string> {
  const col = adminDb().collection(INVERSORES_COLLECTION)
  const ref = id ? col.doc(id) : col.doc()
  const ahora = Timestamp.now()
  const doc: InversorDocument = {
    ...datos,
    estado: 'activo',
    nombreNormalizado: normalizarNombre(datos.nombre),
    createdAt: ahora,
    updatedAt: ahora,
    createdBy: uid,
    updatedBy: uid,
  }
  if (!id) {
    await ref.set(doc)
    return ref.id
  }
  try {
    await ref.create(doc)
  } catch (err) {
    if ((err as { code?: number }).code !== 6) throw err
  }
  return ref.id
}

export async function actualizarInversorDoc(
  id: string,
  cambios: Partial<InversorDatos> & { estado?: EstadoInversor },
  uid: string,
): Promise<void> {
  const extra = cambios.nombre ? { nombreNormalizado: normalizarNombre(cambios.nombre) } : {}
  await adminDb()
    .collection(INVERSORES_COLLECTION)
    .doc(id)
    .update({ ...cambios, ...extra, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid })
}

/** Inversiones de un inversor (o de todos si no se pasa id). */
export async function listInversionesDocs(
  inversorId?: string,
): Promise<Array<{ id: string; data: InversionDocumentBase }>> {
  let query: FirebaseFirestore.Query = adminDb().collection(INVERSIONES_COLLECTION)
  if (inversorId) query = query.where('inversorId', '==', inversorId)
  const snap = await query.get()
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as InversionDocumentBase }))
}

function configRef() {
  return adminDb().collection(FINANZAS_CONFIG_COLLECTION).doc(CONFIG_INVERSIONES_DOC)
}

export async function getConfigInversiones(): Promise<ConfigInversiones> {
  const snap = await configRef().get()
  return configConDefaults(snap.data() as Partial<ConfigInversiones> | undefined, CONFIG_INVERSIONES_DEFAULT)
}

/** Guarda todo menos `ultimoNumero`, que solo lo mueve `siguienteNumeroInversion`. */
export async function guardarConfigInversiones(config: ConfigInversiones, uid: string): Promise<void> {
  const { ultimoNumero: _ignorado, ...resto } = config
  await configRef().set({ ...resto, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid }, { merge: true })
}

/** Reserva el próximo número correlativo en una transacción (INV-0001, INV-0002…). */
export async function siguienteNumeroInversion(): Promise<number> {
  return adminDb().runTransaction(async (tx) => {
    const ref = configRef()
    const snap = await tx.get(ref)
    const actual = (snap.data()?.ultimoNumero as number | undefined) ?? 0
    const siguiente = actual + 1
    tx.set(ref, { ultimoNumero: siguiente }, { merge: true })
    return siguiente
  })
}
