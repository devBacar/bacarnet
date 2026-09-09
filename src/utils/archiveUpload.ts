/** Archivos comprimidos / imagen disco: siempre por staging (evita tope multipart). */
export const ARCHIVE_EXTENSIONS = ['.zip', '.iso', '.7z', '.rar'] as const

export type ArchiveExtension = (typeof ARCHIVE_EXTENSIONS)[number]

export function getArchiveExtension(filename: string): ArchiveExtension | null {
  const lower = filename.trim().toLowerCase()
  for (const ext of ARCHIVE_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext
  }
  return null
}

export function isArchiveUploadFile(file: File): boolean {
  return getArchiveExtension(file.name) !== null
}
