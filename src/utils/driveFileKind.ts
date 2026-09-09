import type { DriveFileDto } from '../services/driveApi'
import {
  getInstallerExtension,
  isInstallerFilename,
} from './installerUpload'

export type DriveFileKind =
  | 'folder'
  | 'document'
  | 'spreadsheet'
  | 'pdf'
  | 'image'
  | 'installer_exe'
  | 'installer_msi'
  | 'installer_dmg'
  | 'installer_pkg'
  | 'binary'

export function driveFileKindFor(file: Pick<DriveFileDto, 'isFolder' | 'mimeType' | 'name'>): DriveFileKind {
  if (file.isFolder) return 'folder'
  if (file.mimeType === 'application/vnd.google-apps.spreadsheet') return 'spreadsheet'
  if (file.mimeType === 'application/vnd.google-apps.document') return 'document'
  if (file.mimeType === 'application/pdf') return 'pdf'
  if (file.mimeType.startsWith('image/')) return 'image'

  const installerExt = getInstallerExtension(file.name)
  if (installerExt === '.exe') return 'installer_exe'
  if (installerExt === '.msi') return 'installer_msi'
  if (installerExt === '.dmg') return 'installer_dmg'
  if (installerExt === '.pkg') return 'installer_pkg'

  if (isInstallerFilename(file.name)) return 'binary'
  return 'document'
}

/** Prefiere el icono que asigna Google Drive al archivo (varía por tipo/MIME). */
export function shouldPreferDriveIconLink(file: Pick<DriveFileDto, 'iconLink' | 'name' | 'isFolder'>): boolean {
  if (file.isFolder || !file.iconLink) return false
  return isInstallerFilename(file.name) || file.iconLink.includes('googleusercontent.com')
}

export function driveFileKindLabel(kind: DriveFileKind): string {
  switch (kind) {
    case 'folder':
      return 'Carpeta'
    case 'spreadsheet':
      return 'Hoja de cálculo'
    case 'pdf':
      return 'PDF'
    case 'image':
      return 'Imagen'
    case 'installer_exe':
      return 'Instalador Windows (.exe)'
    case 'installer_msi':
      return 'Instalador Windows (.msi)'
    case 'installer_dmg':
      return 'Imagen disco macOS (.dmg)'
    case 'installer_pkg':
      return 'Paquete macOS (.pkg)'
    case 'binary':
      return 'Binario'
    default:
      return 'Documento'
  }
}
