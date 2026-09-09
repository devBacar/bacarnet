import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore'
import { db } from './firebase'

const AREAS_COLLECTION = 'folders'

export interface GoverningArea {
  id: string
  name: string
  governingAreaId: string
  parentFolderId: null
  allowedUsers: string[]
  createdAt: Timestamp | Date
  legacy?: boolean
}

function isLegacyArea(data: DocumentData): boolean {
  return data.legacy === true
}

function isAssignableArea(data: DocumentData, name: string): boolean {
  if (isLegacyArea(data)) return false
  if (isSharedAreasFolder(name)) return false
  return true
}

function toDate(value: Timestamp | Date): Date {
  return value instanceof Timestamp ? value.toDate() : value
}

function mapRootArea(id: string, data: DocumentData): GoverningArea {
  const governingAreaId =
    typeof data.governingAreaId === 'string' && data.governingAreaId.length > 0
      ? data.governingAreaId
      : id
  const allowedUsers = Array.isArray(data.allowedUsers)
    ? data.allowedUsers.filter((uid): uid is string => typeof uid === 'string' && uid.length > 0)
    : []

  return {
    id,
    name: typeof data.name === 'string' ? data.name : id,
    governingAreaId,
    parentFolderId: null,
    allowedUsers,
    createdAt: data.createdAt ? toDate(data.createdAt as Timestamp) : new Date(),
    legacy: data.legacy === true ? true : undefined,
  }
}

/** Catálogo de áreas gobernantes (documentos raíz en `folders/`), sin legacy ni bucket transversal. */
export async function listRootAreas(): Promise<GoverningArea[]> {
  const rootsQuery = query(collection(db, AREAS_COLLECTION), where('parentFolderId', '==', null))
  const snapshot = await getDocs(rootsQuery)
  const areas = snapshot.docs
    .map((docSnap) => mapRootArea(docSnap.id, docSnap.data()))
    .filter((area) => !area.legacy)
  areas.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return areas
}

export function isSharedAreasFolder(name: string): boolean {
  return name.trim().toLowerCase() === 'compartido entre áreas'
}

interface PublicAssignableAreaResponse {
  areas?: Array<{
    id: string
    name: string
    governingAreaId?: string
  }>
}

/** Catálogo público vía API (registro sin sesión; misma fuente que listAssignableRootAreas). */
export async function fetchPublicAssignableRootAreas(): Promise<GoverningArea[]> {
  const res = await fetch('/api/catalog/assignable-areas')
  if (!res.ok) {
    throw new Error('No se pudieron cargar las áreas')
  }

  const data = (await res.json()) as PublicAssignableAreaResponse
  return (data.areas ?? []).map((area) => ({
    id: area.id,
    name: area.name,
    governingAreaId: area.governingAreaId ?? area.id,
    parentFolderId: null,
    allowedUsers: [],
    createdAt: new Date(),
  }))
}

/** Áreas raíz asignables en perfiles (excluye legacy y "Compartido entre áreas"). */
export async function listAssignableRootAreas(): Promise<GoverningArea[]> {
  const rootsQuery = query(collection(db, AREAS_COLLECTION), where('parentFolderId', '==', null))
  const snapshot = await getDocs(rootsQuery)
  const areas = snapshot.docs
    .filter((docSnap) => isAssignableArea(docSnap.data(), typeof docSnap.get('name') === 'string' ? docSnap.get('name') : docSnap.id))
    .map((docSnap) => mapRootArea(docSnap.id, docSnap.data()))
  areas.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return areas
}
