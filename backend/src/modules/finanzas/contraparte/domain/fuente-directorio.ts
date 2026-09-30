import type { ContraparteGuardada, ContraparteOrigen } from './contraparte.types.js'
import { cuitOnceDigitos, nombreContraparteLimpio } from './normalizar.js'

export interface EntradaDirectorio {
  nombre: string
  origen: ContraparteOrigen | null
}

/** Si el movimiento solo trae CUIT, el nombre sale del directorio. */
export function contraparteDesdeDirectorio(
  cuit: unknown,
  directorio: ReadonlyMap<string, EntradaDirectorio>,
): ContraparteGuardada | null {
  const digitos = cuitOnceDigitos(cuit)
  if (!digitos) return null
  const entrada = directorio.get(digitos)
  const nombre = nombreContraparteLimpio(entrada?.nombre)
  if (!nombre) return null
  return { nombre, cuit: digitos, origen: 'directorio' }
}
