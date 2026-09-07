import type { drive_v3 } from 'googleapis'

export type DriveWalkFile = {
  id: string
  name: string
  mimeType: string
  size: number
  modifiedTime: string | null
  webViewLink: string | null
  parentFolderId: string | null
}

const SKIP_MIME = new Set([
  'application/vnd.google-apps.folder',
  'application/vnd.google-apps.shortcut',
  'application/vnd.google-apps.map',
  'application/vnd.google-apps.site',
])

async function listChildren(drive: drive_v3.Drive, folderId: string): Promise<DriveWalkFile[]> {
  const files: DriveWalkFile[] = []
  let pageToken: string | undefined

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields:
        'nextPageToken, files(id,name,mimeType,size,modifiedTime,webViewLink,parents)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 200,
      pageToken,
    })

    for (const item of res.data.files ?? []) {
      if (!item.id || !item.name) continue
      files.push({
        id: item.id,
        name: item.name,
        mimeType: item.mimeType ?? 'application/octet-stream',
        size: Number(item.size) || 0,
        modifiedTime: item.modifiedTime ?? null,
        webViewLink: item.webViewLink ?? null,
        parentFolderId: item.parents?.[0] ?? null,
      })
    }

    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  return files
}

export async function walkDriveFolder(
  drive: drive_v3.Drive,
  rootFolderId: string,
): Promise<{ files: DriveWalkFile[]; foldersVisited: number }> {
  const allFiles: DriveWalkFile[] = []
  const queue = [rootFolderId]
  let foldersVisited = 0

  while (queue.length > 0) {
    const folderId = queue.shift()
    if (!folderId) continue
    foldersVisited += 1

    const children = await listChildren(drive, folderId)
    for (const item of children) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        queue.push(item.id)
        continue
      }
      if (SKIP_MIME.has(item.mimeType)) continue
      allFiles.push(item)
    }
  }

  return { files: allFiles, foldersVisited }
}
