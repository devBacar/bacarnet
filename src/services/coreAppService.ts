import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore'
import { db } from './firebase'

const CORE_APPS_COLLECTION = 'coreApps'

export type CoreAppLinkKind = 'app' | 'external_link'

export interface CoreApp {
  id?: string
  title: string
  description: string
  url: string
  icon?: string
  imageUrl?: string
  linkKind?: CoreAppLinkKind
  createdAt: Timestamp | Date
}

function toDate(value: Timestamp | Date): Date {
  return value instanceof Timestamp ? value.toDate() : value
}

function mapDocToCoreApp(id: string, data: DocumentData): CoreApp {
  const createdAt = data.createdAt
    ? toDate(data.createdAt as Timestamp)
    : new Date()

  return {
    id,
    title: data.title ?? '',
    description: data.description ?? '',
    url: data.url ?? '',
    icon: data.icon ?? undefined,
    imageUrl: data.imageUrl ?? undefined,
    linkKind: data.linkKind === 'external_link' ? 'external_link' : 'app',
    createdAt,
  }
}

export async function getCoreApps(): Promise<CoreApp[]> {
  const appsQuery = query(
    collection(db, CORE_APPS_COLLECTION),
    orderBy('createdAt', 'asc'),
  )

  const snapshot = await getDocs(appsQuery)

  if (snapshot.empty) {
    return []
  }

  return snapshot.docs
    .map((document) => {
      try {
        return mapDocToCoreApp(document.id, document.data())
      } catch (error) {
        console.error(`Error al mapear la aplicación ${document.id}:`, error)
        return null
      }
    })
    .filter((app): app is CoreApp => app !== null)
}

export type CreateCoreAppInput = Omit<CoreApp, 'id' | 'createdAt'>

export async function createCoreApp(data: CreateCoreAppInput): Promise<string> {
  const payload: Record<string, unknown> = {
    title: data.title.trim(),
    description: data.description.trim(),
    url: data.url.trim(),
    createdAt: serverTimestamp(),
  }

  if (data.icon?.trim()) {
    payload.icon = data.icon.trim()
  }

  if (data.imageUrl?.trim()) {
    payload.imageUrl = data.imageUrl.trim()
  }

  payload.linkKind = data.linkKind === 'external_link' ? 'external_link' : 'app'

  const docRef = await addDoc(collection(db, CORE_APPS_COLLECTION), payload)
  return docRef.id
}

export async function updateCoreApp(
  id: string,
  data: CreateCoreAppInput,
): Promise<void> {
  const payload: Record<string, unknown> = {
    title: data.title.trim(),
    description: data.description.trim(),
    url: data.url.trim(),
    icon: data.icon?.trim() ?? null,
    imageUrl: data.imageUrl?.trim() ?? null,
    linkKind: data.linkKind === 'external_link' ? 'external_link' : 'app',
  }

  await updateDoc(doc(db, CORE_APPS_COLLECTION, id), payload)
}

export async function deleteCoreApp(id: string): Promise<void> {
  await deleteDoc(doc(db, CORE_APPS_COLLECTION, id))
}
