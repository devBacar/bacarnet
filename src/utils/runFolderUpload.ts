import { createDriveFile } from '../services/driveApi'
import { collectFolderPaths, folderPathKey, folderPathForFile } from './folderUploadPlan'

export async function ensureFolderUploadTree(input: {
  files: File[]
  rootParentFolderId: string
  reason: string
  onFolderProgress?: (completed: number, total: number) => void
}): Promise<Map<string, string>> {
  const cache = new Map<string, string>()
  const folderPaths = collectFolderPaths(input.files)
  const total = folderPaths.length

  for (let index = 0; index < folderPaths.length; index += 1) {
    const segments = folderPaths[index]
    let parentId = input.rootParentFolderId

    for (let depth = 0; depth < segments.length; depth += 1) {
      const partial = segments.slice(0, depth + 1)
      const key = folderPathKey(partial)
      const cached = cache.get(key)
      if (cached) {
        parentId = cached
        continue
      }

      const created = await createDriveFile({
        name: partial[partial.length - 1],
        type: 'folder',
        parentFolderId: parentId,
        folderAccessMode: 'restricted',
        reason: input.reason,
      })
      cache.set(key, created.id)
      parentId = created.id
    }

    input.onFolderProgress?.(index + 1, total)
  }

  return cache
}

export function resolveFolderUploadParentId(
  rootParentFolderId: string,
  file: File,
  folderCache: Map<string, string>,
): string {
  const segments = folderPathForFile(file)
  if (segments.length === 0) return rootParentFolderId
  return folderCache.get(folderPathKey(segments)) ?? rootParentFolderId
}
