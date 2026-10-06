import type { Readable } from 'node:stream'
import { getDrive } from '../../../lib/google/driveClient.js'

/** Carpeta "Backups_Salarios" de Drive, compartida con datos@ (lectura). Se puede cambiar con RRHH_BACKUPS_FOLDER_ID. */
export const RRHH_BACKUPS_FOLDER_ID_POR_DEFECTO = '1MxKOv51DzXaDSFsgOBL1c-dRaxe9M8Nc'

export interface BackupSalario {
  id: string
  nombre: string
  bytes: number
  md5: string | null
  /** ISO 8601: cuándo se subió a Drive. */
  creado: string
}

export function carpetaBackups(): string {
  const id = process.env.RRHH_BACKUPS_FOLDER_ID?.trim() || RRHH_BACKUPS_FOLDER_ID_POR_DEFECTO
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error('RRHH_BACKUPS_FOLDER_ID no es un id de carpeta de Drive válido')
  }
  return id
}

/** Último backup de Salario (.sql) subido a la carpeta, o null si no hay ninguno. */
export async function buscarUltimoBackup(): Promise<BackupSalario | null> {
  const drive = await getDrive()
  const res = await drive.files.list({
    q: `'${carpetaBackups()}' in parents and trashed = false and name contains 'Backup_'`,
    orderBy: 'createdTime desc',
    pageSize: 10,
    fields: 'files(id,name,size,md5Checksum,createdTime)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const archivo = (res.data.files ?? []).find((f) => f.id && f.name?.toLowerCase().endsWith('.sql'))
  if (!archivo?.id || !archivo.name) return null
  return {
    id: archivo.id,
    nombre: archivo.name,
    bytes: Number(archivo.size ?? 0),
    md5: archivo.md5Checksum ?? null,
    creado: archivo.createdTime ?? new Date(0).toISOString(),
  }
}

/** Contenido del backup como stream: no se descarga entero a memoria. */
export async function abrirBackup(fileId: string): Promise<Readable> {
  const drive = await getDrive()
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  )
  return res.data as unknown as Readable
}
