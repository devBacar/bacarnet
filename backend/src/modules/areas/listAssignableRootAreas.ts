import type { DocumentData } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'

export interface AssignableRootArea {
  id: string
  name: string
  governingAreaId: string
}

function isSharedAreasFolder(name: string): boolean {
  return name.trim().toLowerCase() === 'compartido entre áreas'
}

function isAssignableArea(data: DocumentData, name: string): boolean {
  if (data.legacy === true) return false
  if (isSharedAreasFolder(name)) return false
  return true
}

/** Áreas raíz asignables (catálogo `folders/` raíz, sin legacy ni bucket transversal). */
export async function listAssignableRootAreas(): Promise<AssignableRootArea[]> {
  const snapshot = await adminDb()
    .collection('folders')
    .where('parentFolderId', '==', null)
    .get()

  const areas = snapshot.docs
    .filter((docSnap) => {
      const name = typeof docSnap.get('name') === 'string' ? docSnap.get('name') : docSnap.id
      return isAssignableArea(docSnap.data(), name)
    })
    .map((docSnap) => {
      const name = typeof docSnap.get('name') === 'string' ? docSnap.get('name') : docSnap.id
      const governingAreaIdRaw = docSnap.get('governingAreaId')
      const governingAreaId =
        typeof governingAreaIdRaw === 'string' && governingAreaIdRaw.length > 0
          ? governingAreaIdRaw
          : docSnap.id

      return {
        id: docSnap.id,
        name,
        governingAreaId,
      }
    })

  areas.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return areas
}
