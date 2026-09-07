/** Área Sistemas — única donde se permiten instaladores/ejecutables. */
export const SISTEMAS_GOVERNING_AREA_ID = 'r7QVKsrSiqDWC8DrXCac'

export const INSTALLER_EXTENSIONS = ['.exe', '.msi', '.dmg', '.pkg'] as const
export type InstallerExtension = (typeof INSTALLER_EXTENSIONS)[number]

const EXE_MIMES = new Set([
  'application/x-msdownload',
  'application/vnd.microsoft.portable-executable',
  'application/x-dosexec',
])

const MSI_MIMES = new Set(['application/x-msi', 'application/vnd.ms-msi'])

const DMG_MIMES = new Set(['application/x-apple-diskimage'])

const PKG_MIMES = new Set(['application/vnd.apple.installer+xml'])

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

function mimeMatchesInstallerExtension(
  mimeType: string,
  extension: InstallerExtension,
): boolean {
  const mime = mimeType.trim().toLowerCase()
  if (mime === 'application/octet-stream') return true

  switch (extension) {
    case '.exe':
      return EXE_MIMES.has(mime)
    case '.msi':
      return MSI_MIMES.has(mime)
    case '.dmg':
      return DMG_MIMES.has(mime)
    case '.pkg':
      return PKG_MIMES.has(mime)
    default:
      return false
  }
}

export type InstallerUploadValidation =
  | { ok: true; extension: InstallerExtension }
  | { ok: false; error: string; code: string }

/** Valida extensión + coherencia MIME. Octet-stream solo pasa con extensión de instalador. */
export function validateInstallerUpload(
  mimeType: string,
  filename: string,
): InstallerUploadValidation {
  const extension = getInstallerExtension(filename)
  if (!extension) {
    return {
      ok: false,
      error: 'Los instaladores deben terminar en .exe, .msi, .dmg o .pkg',
      code: 'installer_extension_required',
    }
  }

  if (!mimeMatchesInstallerExtension(mimeType, extension)) {
    return {
      ok: false,
      error: `El tipo MIME no es válido para un instalador ${extension}`,
      code: 'installer_mime_mismatch',
    }
  }

  return { ok: true, extension }
}

export function isInstallerArea(governingAreaId: string | null): boolean {
  return governingAreaId === SISTEMAS_GOVERNING_AREA_ID
}
