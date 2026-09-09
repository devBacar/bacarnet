import {
  Archive,
  Box,
  Disc3,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  Package,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { DriveFileDto } from '../services/driveApi'
import {
  driveFileKindFor,
  shouldPreferDriveIconLink,
  type DriveFileKind,
} from '../utils/driveFileKind'

const kindIcon: Record<DriveFileKind, LucideIcon> = {
  folder: Folder,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  pdf: FileText,
  image: FileImage,
  installer_exe: Box,
  installer_msi: Package,
  installer_dmg: Disc3,
  installer_pkg: Archive,
  binary: FileText,
}

const kindColor: Record<DriveFileKind, string> = {
  folder: 'text-amber-500',
  document: 'text-blue-600 dark:text-blue-400',
  spreadsheet: 'text-emerald-600 dark:text-emerald-400',
  pdf: 'text-danger',
  image: 'text-violet-600 dark:text-violet-400',
  installer_exe: 'text-sky-600 dark:text-sky-400',
  installer_msi: 'text-indigo-600 dark:text-indigo-400',
  installer_dmg: 'text-neutral-600 dark:text-neutral-300',
  installer_pkg: 'text-amber-600 dark:text-amber-400',
  binary: 'text-neutral-500 dark:text-neutral-400',
}

const sizeClass = {
  sm: 'h-5 w-5',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
} as const

type DriveFileIconProps = {
  file: DriveFileDto
  size?: keyof typeof sizeClass
  className?: string
}

/** Icono de archivo Drive: iconLink de Google cuando existe; fallback por tipo/instalador. */
export function DriveFileIcon({ file, size = 'sm', className = '' }: DriveFileIconProps) {
  const kind = driveFileKindFor(file)
  const [driveIconFailed, setDriveIconFailed] = useState(false)
  const preferDriveIcon = shouldPreferDriveIconLink(file) && !driveIconFailed

  if (preferDriveIcon && file.iconLink) {
    return (
      <img
        src={file.iconLink}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setDriveIconFailed(true)}
        className={`${sizeClass[size]} shrink-0 object-contain ${className}`}
      />
    )
  }

  const Icon = kindIcon[kind]
  return <Icon className={`${sizeClass[size]} shrink-0 ${kindColor[kind]} ${className}`} />
}

export { kindColor as driveFileKindColor, kindIcon as driveFileKindIcon }
