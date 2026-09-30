import { claveNombreCategoria } from './categoria-movimiento.js'

export type DecisionReglaSemilla =
  | { accion: 'crear' }
  | { accion: 'mantener' }
  | { accion: 'mover'; categoriaActualNombre: string }
  | { accion: 'respetar'; categoriaActualNombre: string }

/**
 * Qué hacer con una regla de descripción de la semilla.
 * Mover solo si la categoría actual está en `reemplazaA`. Cualquier otra se respeta:
 * la eligió el líder.
 */
export function decidirReglaDescripcionSemilla(input: {
  regla: { categoriaId: string } | null
  categoriaSemillaId: string
  categoriaActualNombre: string | null
  reemplazaA: readonly string[]
}): DecisionReglaSemilla {
  if (!input.regla) return { accion: 'crear' }
  if (input.regla.categoriaId === input.categoriaSemillaId) return { accion: 'mantener' }
  const nombre = input.categoriaActualNombre?.trim() ?? ''
  const reemplaza = new Set(input.reemplazaA.map((item) => claveNombreCategoria(item)))
  if (nombre && reemplaza.has(claveNombreCategoria(nombre))) {
    return { accion: 'mover', categoriaActualNombre: nombre }
  }
  return { accion: 'respetar', categoriaActualNombre: nombre || 'Categoría eliminada' }
}

/**
 * Código de Interbanking y CUIT: se crean si no existen. Si ya apuntan a otro lado,
 * no se mueven.
 */
export function decidirReglaClaveSemilla(input: {
  regla: { categoriaId: string } | null
  categoriaSemillaId: string
  categoriaActualNombre: string | null
}): DecisionReglaSemilla {
  if (!input.regla) return { accion: 'crear' }
  if (input.regla.categoriaId === input.categoriaSemillaId) return { accion: 'mantener' }
  const nombre = input.categoriaActualNombre?.trim() ?? ''
  return { accion: 'respetar', categoriaActualNombre: nombre || 'Categoría eliminada' }
}

/**
 * El CUIT pisa una categoría vacía o una que puso una regla de texto/código.
 * Si ya está en la categoría del CUIT, o si la puso una persona, no se toca.
 */
export function debePasarMovimientoACuit(input: {
  categoriaId: string | null
  categoriaPorTextoOCodigo: string | null
  categoriaCuitId: string
}): boolean {
  if (!input.categoriaId) return true
  if (input.categoriaId === input.categoriaCuitId) return false
  return input.categoriaId === input.categoriaPorTextoOCodigo
}

/** null = se puede borrar. Si no, el texto que explica por qué se mantiene. */
export function motivoCategoriaMantenida(input: { movimientos: number; reglas: number }): string | null {
  const partes: string[] = []
  if (input.movimientos > 0) {
    partes.push(`${input.movimientos} ${input.movimientos === 1 ? 'movimiento' : 'movimientos'}`)
  }
  if (input.reglas > 0) {
    partes.push(`${input.reglas} ${input.reglas === 1 ? 'regla' : 'reglas'}`)
  }
  if (partes.length === 0) return null
  return `Se mantiene porque todavía tiene ${partes.join(' y ')}`
}
