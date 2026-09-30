import type { ContraparteGuardada } from './contraparte.types.js'
import { claveTexto, nombreContraparteLimpio } from './normalizar.js'
import { TABLA_CONTRAPARTE_POR_CATEGORIA } from './tabla-categoria.js'

export interface CategoriaConocida {
  nombre: string
  grupo: string | null
}

export function contraparteDesdeCategoria(
  input: { categoriaId: string | null; bancoNombre: string },
  categorias: ReadonlyMap<string, CategoriaConocida>,
): ContraparteGuardada | null {
  if (!input.categoriaId) return null
  const categoria = categorias.get(input.categoriaId)
  if (!categoria) return null
  const nombreClave = claveTexto(categoria.nombre)
  const grupoClave = claveTexto(categoria.grupo)
  const porNombre = TABLA_CONTRAPARTE_POR_CATEGORIA.find(
    (fila) => fila.categoria && claveTexto(fila.categoria) === nombreClave,
  )
  const porGrupo = TABLA_CONTRAPARTE_POR_CATEGORIA.find(
    (fila) => fila.grupo && claveTexto(fila.grupo) === grupoClave,
  )
  const fila = porNombre ?? porGrupo
  if (!fila) return null
  const banco = nombreContraparteLimpio(input.bancoNombre) ?? 'el banco'
  const nombre = nombreContraparteLimpio(fila.nombre.split('{banco}').join(banco))
  if (!nombre) return null
  return { nombre, cuit: null, origen: 'categoria' }
}
