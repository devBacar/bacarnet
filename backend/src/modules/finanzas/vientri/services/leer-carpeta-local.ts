import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LeerArchivo } from './importar-vientri.js'

/** Lector para el script: lee los CSV de una carpeta del disco. */
export function lectorCarpetaLocal(carpeta: string): LeerArchivo {
  return async (nombre: string) => {
    try {
      return await readFile(join(carpeta, nombre), 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }
}
