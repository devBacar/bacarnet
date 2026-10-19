import { getDrive } from '../../../../lib/google/driveClient.js'
import { PATRON_ZIP_VIENTRI } from '../domain/zip.js'

/**
 * Carpeta "Bacarnet_Vientri" de Drive (de admin@, compartida con datos@ y sistemas.TI@).
 * SIS5 deja ahí un .zip por día con la exportación. Se puede cambiar con VIENTRI_DRIVE_FOLDER_ID.
 */
export const VIENTRI_DRIVE_FOLDER_ID_POR_DEFECTO = '1TUBUgbYyvf-OTYXmMfN8kcbyBiuwliv1'

export function carpetaVientriDrive(): string {
  const id = process.env.VIENTRI_DRIVE_FOLDER_ID?.trim() || VIENTRI_DRIVE_FOLDER_ID_POR_DEFECTO
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('VIENTRI_DRIVE_FOLDER_ID no es un id de carpeta de Drive válido')
  return id
}

export interface ZipVientriDrive {
  id: string
  nombre: string
  bytes: number
  creado: string
}

/** El zip más nuevo (por nombre: vientri_AAAAMMDD_HHMM.zip) de la carpeta, o null si no hay. */
export async function buscarUltimoZipVientri(): Promise<ZipVientriDrive | null> {
  const drive = await getDrive()
  const res = await drive.files.list({
    q: `'${carpetaVientriDrive()}' in parents and trashed = false and name contains 'vientri_'`,
    orderBy: 'name desc',
    pageSize: 20,
    fields: 'files(id,name,size,createdTime)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const archivo = (res.data.files ?? []).find((f) => f.id && f.name && PATRON_ZIP_VIENTRI.test(f.name))
  if (!archivo?.id || !archivo.name) return null
  return {
    id: archivo.id,
    nombre: archivo.name,
    bytes: Number(archivo.size ?? 0),
    creado: archivo.createdTime ?? new Date(0).toISOString(),
  }
}

/** Descarga el zip entero (pesa ~7 MB). */
export async function descargarZipVientri(fileId: string): Promise<Uint8Array> {
  const drive = await getDrive()
  const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' })
  return new Uint8Array(res.data as ArrayBuffer)
}
