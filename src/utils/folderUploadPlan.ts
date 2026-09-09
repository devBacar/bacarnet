const SKIP_FILE_NAMES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini'])

export function isSkippedUploadFile(file: File): boolean {
  const name = file.name.toLowerCase()
  if (SKIP_FILE_NAMES.has(name)) return true
  if (name.startsWith('._')) return true
  return false
}

export function folderPathKey(segments: string[]): string {
  return segments.join('/')
}

/** Segmentos de carpeta incluyendo la raíz seleccionada, sin el nombre del archivo. */
export function folderPathForFile(file: File): string[] {
  const relative = file.webkitRelativePath?.trim()
  if (!relative) return []
  const parts = relative.split('/').filter(Boolean)
  if (parts.length <= 1) return []
  return parts.slice(0, -1)
}

/** Rutas únicas de carpetas a crear, ordenadas por profundidad. */
export function collectFolderPaths(files: File[]): string[][] {
  const seen = new Set<string>()
  const paths: string[][] = []

  for (const file of files) {
    if (isSkippedUploadFile(file)) continue
    const relative = file.webkitRelativePath?.trim()
    if (!relative) continue

    const parts = relative.split('/').filter(Boolean)
    if (parts.length <= 1) continue

    for (let depth = 1; depth < parts.length; depth += 1) {
      const folderParts = parts.slice(0, depth)
      const key = folderPathKey(folderParts)
      if (seen.has(key)) continue
      seen.add(key)
      paths.push(folderParts)
    }
  }

  return paths.sort((a, b) => a.length - b.length || a.join('/').localeCompare(b.join('/')))
}

export function isFolderUploadSelection(files: File[]): boolean {
  return files.some((file) => Boolean(file.webkitRelativePath?.includes('/')))
}

export function summarizeFolderUpload(files: File[]): {
  rootName: string | null
  fileCount: number
  folderCount: number
  totalBytes: number
} {
  const usable = files.filter((file) => !isSkippedUploadFile(file))
  let rootName: string | null = null

  for (const file of usable) {
    const relative = file.webkitRelativePath?.trim()
    if (!relative) continue
    const first = relative.split('/').filter(Boolean)[0]
    if (first) {
      rootName = first
      break
    }
  }

  return {
    rootName,
    fileCount: usable.length,
    folderCount: collectFolderPaths(usable).length,
    totalBytes: usable.reduce((sum, file) => sum + file.size, 0),
  }
}
