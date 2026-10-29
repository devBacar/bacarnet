import type { FilaCsv } from './csv.js'
import { aCuit, aEntero, aTexto } from './valores.js'

export interface ProveedorOcasional {
  vientriId: number
  nombre: string | null
  cuit: string | null
}

export function mapearProoca(f: FilaCsv): ProveedorOcasional | null {
  const id = aEntero(f.ID || f.id || f.vientri_id)
  if (id === null) return null
  return {
    vientriId: id,
    nombre: aTexto(f.DES || f.des || f.nombre),
    cuit: aCuit(f.CUIT || f.cuit),
  }
}

export function indiceProoca(proveedores: ProveedorOcasional[]): Map<number, ProveedorOcasional> {
  return new Map(proveedores.map((p) => [p.vientriId, p]))
}
