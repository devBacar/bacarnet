import { getDrive } from '../../../lib/google/driveClient.js'
import { getNegocioBoardFolderId } from '../boardNegocioConfig.js'
import { validarDatosNegocio } from '../domain/validar.js'

export const NOMBRE_ARCHIVO_DATOS = 'datos.json'

export class DatosNegocioError extends Error {
  constructor(
    readonly status: 404 | 422 | 503,
    message: string,
  ) {
    super(message)
  }
}

export interface RespuestaDatosNegocio {
  /** modifiedTime de datos.json en Drive (ISO). El tablero muestra "Datos al dd/mm". */
  actualizado: string
  datos: unknown
}

interface EnCache {
  fileId: string
  modifiedTime: string
  datos: unknown
}

let cache: EnCache | null = null

/** Para los tests. */
export function vaciarCacheDatosNegocio(): void {
  cache = null
}

/**
 * Lee `datos.json` de la carpeta de Drive del tablero (el más nuevo por modifiedTime). Solo vuelve a descargar si
 * cambió el archivo o su fecha de modificación.
 */
export async function leerDatosNegocio(): Promise<RespuestaDatosNegocio> {
  const carpeta = getNegocioBoardFolderId()
  if (!carpeta) throw new DatosNegocioError(503, 'Tablero de Negocio no configurado')
  if (!/^[A-Za-z0-9_-]+$/.test(carpeta)) throw new DatosNegocioError(503, 'NEGOCIO_BOARD_FOLDER_ID no es un id de carpeta de Drive válido')

  const drive = await getDrive()
  const listado = await drive.files.list({
    q: `'${carpeta}' in parents and name = '${NOMBRE_ARCHIVO_DATOS}' and trashed = false`,
    orderBy: 'modifiedTime desc',
    pageSize: 5,
    fields: 'files(id,name,modifiedTime)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const archivos = (listado.data.files ?? []).filter((f) => f.id && f.modifiedTime)
  archivos.sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)))
  const archivo = archivos[0]
  if (!archivo?.id || !archivo.modifiedTime) {
    throw new DatosNegocioError(404, 'Todavía no hay datos cargados para este tablero. Falta el archivo datos.json en la carpeta.')
  }

  if (cache && cache.fileId === archivo.id && cache.modifiedTime === archivo.modifiedTime) {
    return { actualizado: cache.modifiedTime, datos: cache.datos }
  }

  const descarga = await drive.files.get({ fileId: archivo.id, alt: 'media', supportsAllDrives: true }, { responseType: 'text' })
  let datos: unknown
  try {
    datos = typeof descarga.data === 'string' ? JSON.parse(descarga.data) : descarga.data
  } catch {
    throw new DatosNegocioError(422, 'El archivo datos.json no es un JSON válido.')
  }
  const validacion = validarDatosNegocio(datos)
  if (!validacion.ok) throw new DatosNegocioError(422, validacion.error)

  cache = { fileId: archivo.id, modifiedTime: archivo.modifiedTime, datos }
  return { actualizado: archivo.modifiedTime, datos }
}
