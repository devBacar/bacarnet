export const INSTALLER_EXTENSIONS = ['.exe', '.msi', '.dmg', '.pkg'] as const

const INSTALLER_EXTENSION_PATTERN = /\.(exe|msi|dmg|pkg)$/i

/** Detecta instaladores por extensión (upload directo, sin aprobación Office). */
export function isInstallerUploadFile(file: File): boolean {
  return INSTALLER_EXTENSION_PATTERN.test(file.name.trim())
}
