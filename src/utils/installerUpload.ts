export const INSTALLER_EXTENSIONS = ['.exe', '.msi', '.dmg', '.pkg'] as const

export type InstallerExtension = (typeof INSTALLER_EXTENSIONS)[number]

export function getInstallerExtension(filename: string): InstallerExtension | null {
  const lower = filename.trim().toLowerCase()
  for (const ext of INSTALLER_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext
  }
  return null
}

export function isInstallerFilename(filename: string): boolean {
  return getInstallerExtension(filename) !== null
}

/** Detecta instaladores por extensión (upload directo, sin aprobación Office). */
export function isInstallerUploadFile(file: File): boolean {
  return isInstallerFilename(file.name)
}
