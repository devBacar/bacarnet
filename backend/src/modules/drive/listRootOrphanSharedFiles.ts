import type { drive_v3 } from 'googleapis'
import { googleStatus } from './assertInSharedDrive.js'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

const SHARED_FILE_FIELDS =
  'nextPageToken, files(id, name, mimeType, parents, driveId, modifiedTime, createdTime, size, iconLink, webViewLink, shortcutDetails, lastModifyingUser(displayName,emailAddress), capabilities(canTrash,canEdit,canShare,canAddChildren))'

/**
 * Archivos de la unidad compartida compartidos directamente con el usuario
 * cuya carpeta padre no es accesible (no aparecen al listar hijos del padre).
 */
export async function listRootOrphanSharedFiles(
  drive: drive_v3.Drive,
  sharedDriveId: string,
  knownIds: Set<string>,
): Promise<drive_v3.Schema$File[]> {
  const listed = await drive.files.list({
    corpora: 'user',
    q: 'sharedWithMe=true and trashed=false',
    fields: SHARED_FILE_FIELDS,
    pageSize: 100,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    orderBy: 'folder,name',
  })

  const candidates = (listed.data.files ?? []).filter((file) => {
    if (!file.id || knownIds.has(file.id)) return false
    if (file.mimeType === FOLDER_MIME) return false
    return file.driveId === sharedDriveId
  })

  const orphans: drive_v3.Schema$File[] = []
  for (const file of candidates) {
    const parentId = file.parents?.[0]
    if (!parentId) {
      orphans.push(file)
      continue
    }
    try {
      await drive.files.get({
        fileId: parentId,
        supportsAllDrives: true,
        fields: 'id',
      })
    } catch (err) {
      const status = googleStatus(err)
      if (status === 403 || status === 404) {
        orphans.push(file)
      } else {
        throw err
      }
    }
  }

  return orphans
}
