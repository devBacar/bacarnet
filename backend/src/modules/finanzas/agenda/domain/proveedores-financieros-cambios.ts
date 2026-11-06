import { normalizarNombre } from './normalizar-nombre.js'

/** Lo que identifica a un proveedor: nombre a mostrar, su clave normalizada y las otras formas en que aparece escrito. */
export interface ProveedorNombres {
  nombre: string
  nombreNormalizado: string
  alias: string[]
}

/** Agrega nombres a la lista sin repetir (comparando normalizado) y sin incluir los que ya son la clave principal. */
function unirAlias(base: string[], nuevos: string[], excluirClave: string): string[] {
  const vistos = new Set([excluirClave])
  const out: string[] = []
  for (const a of [...base, ...nuevos]) {
    const clave = normalizarNombre(a)
    if (!clave || vistos.has(clave)) continue
    vistos.add(clave)
    out.push(a)
  }
  return out
}

/**
 * Cambia el nombre que se muestra sin perder cómo se engancharon los cheques: el nombre viejo pasa a ser
 * un alias (sigue enganchando lo mismo) y, si el nombre nuevo ya era uno de sus alias, deja de estar repetido.
 */
export function aplicarRenombre(actual: ProveedorNombres, nombreNuevo: string): ProveedorNombres {
  const nombreNormalizado = normalizarNombre(nombreNuevo)
  return {
    nombre: nombreNuevo,
    nombreNormalizado,
    alias: unirAlias(actual.alias, [actual.nombre], nombreNormalizado),
  }
}

/** El que queda se lleva el nombre y los alias del que se va; su propio nombre no cambia. */
export function aplicarFusion(queda: ProveedorNombres, seVa: ProveedorNombres): ProveedorNombres {
  return {
    ...queda,
    alias: unirAlias(queda.alias, [seVa.nombre, ...seVa.alias], queda.nombreNormalizado),
  }
}
