import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { normalizarNombre } from '../domain/normalizar-nombre.js'

export const PROVEEDORES_FINANCIEROS_COLLECTION = 'proveedoresFinancieros'

export interface ProveedorFinancieroDocument {
  nombre: string
  nombreNormalizado: string
  /** Otras formas en que aparece escrito el mismo proveedor (ej. "OP MANA" para MANA). */
  alias?: string[]
  creadoPor: string
  createdAt: Timestamp
  /** Baja lógica: un proveedor inactivo no engancha cheques ni aparece en la lista. Sin campo = activo. */
  estado?: 'activo' | 'inactivo'
  /** Si se dio de baja al fusionarlo con otro: id del proveedor que lo absorbió. */
  fusionadoEn?: string | null
  bajaPor?: string | null
  bajaAt?: Timestamp | null
}

export interface ProveedorFinancieroVista {
  id: string
  nombre: string
  alias: string[]
  creadoPor: string
  createdAt: string | null
}

/** Solo los activos: los dados de baja (o fusionados en otro) no cuentan para nada. */
export async function listProveedoresFinancierosDocs(): Promise<
  Array<{ id: string; data: ProveedorFinancieroDocument }>
> {
  const snap = await adminDb().collection(PROVEEDORES_FINANCIEROS_COLLECTION).get()
  return snap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as ProveedorFinancieroDocument }))
    .filter((row) => row.data.estado !== 'inactivo')
}

/** Nombre del proveedor + sus alias, ya normalizados: todo lo que lo identifica. */
export function clavesDeProveedor(data: Pick<ProveedorFinancieroDocument, 'nombreNormalizado' | 'alias'>): string[] {
  const claves = [data.nombreNormalizado, ...(data.alias ?? []).map(normalizarNombre)]
  return [...new Set(claves.filter(Boolean))]
}

export async function nombresNormalizadosProveedoresFinancieros(): Promise<Set<string>> {
  const rows = await listProveedoresFinancierosDocs()
  return new Set(rows.flatMap((row) => clavesDeProveedor(row.data)))
}

export interface ProveedorFinancieroResuelto {
  id: string
  nombre: string
}

/** Nombre normalizado (o alias) → proveedor cargado. Es la fuente única para saber a quién corresponde un nombre. */
export async function mapaProveedoresFinancieros(): Promise<Map<string, ProveedorFinancieroResuelto>> {
  const rows = await listProveedoresFinancierosDocs()
  const mapa = new Map<string, ProveedorFinancieroResuelto>()
  for (const row of rows) {
    for (const clave of clavesDeProveedor(row.data)) mapa.set(clave, { id: row.id, nombre: row.data.nombre })
  }
  return mapa
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
  const nombreNormalizado = normalizarNombre(nombre)
  const col = adminDb().collection(PROVEEDORES_FINANCIEROS_COLLECTION)
  // ID derivado del nombre ('/' no es válido en IDs de Firestore). Si ya existe (un proveedor dado de baja, o uno
  // renombrado que conserva su id viejo), se usa uno automático para no pisarlo.
  let ref = col.doc(`provfin-${nombreNormalizado.replace(/\//g, '-')}`)
  if ((await ref.get()).exists) ref = col.doc()
  const doc: ProveedorFinancieroDocument = {
    nombre,
    nombreNormalizado,
    creadoPor: uid,
    createdAt: Timestamp.now(),
    estado: 'activo',
  }
  await ref.create(doc)
  return ref.id
}

/** Devuelve el proveedor solo si está activo. */
export async function getProveedorFinancieroDoc(id: string): Promise<ProveedorFinancieroDocument | null> {
  const snap = await adminDb().collection(PROVEEDORES_FINANCIEROS_COLLECTION).doc(id).get()
  if (!snap.exists) return null
  const data = snap.data() as ProveedorFinancieroDocument
  return data.estado === 'inactivo' ? null : data
}

/** Reemplaza la lista de alias (el servicio ya validó que no choquen con otro proveedor). */
export async function guardarAliasDoc(id: string, alias: string[]): Promise<void> {
  await adminDb().collection(PROVEEDORES_FINANCIEROS_COLLECTION).doc(id).update({ alias })
}

/** Cambia el nombre a mostrar; el id no cambia nunca. */
export async function guardarNombreDoc(
  id: string,
  datos: { nombre: string; nombreNormalizado: string; alias: string[] },
): Promise<void> {
  await adminDb().collection(PROVEEDORES_FINANCIEROS_COLLECTION).doc(id).update(datos)
}

/** Baja lógica: no se borra, deja de contar. */
export async function darDeBajaProveedorFinancieroDoc(id: string, uid: string): Promise<boolean> {
  const ref = adminDb().collection(PROVEEDORES_FINANCIEROS_COLLECTION).doc(id)
  const snap = await ref.get()
  if (!snap.exists || (snap.data() as ProveedorFinancieroDocument).estado === 'inactivo') return false
  await ref.update({ estado: 'inactivo', bajaPor: uid, bajaAt: Timestamp.now() })
  return true
}

/** En una sola escritura: el que queda se lleva los alias y el otro se da de baja apuntando a él. */
export async function fusionarProveedoresDocs(
  quedaId: string,
  aliasQueda: string[],
  seVaId: string,
  uid: string,
): Promise<void> {
  const col = adminDb().collection(PROVEEDORES_FINANCIEROS_COLLECTION)
  const batch = adminDb().batch()
  batch.update(col.doc(quedaId), { alias: aliasQueda })
  batch.update(col.doc(seVaId), { estado: 'inactivo', fusionadoEn: quedaId, bajaPor: uid, bajaAt: Timestamp.now() })
  await batch.commit()
}
