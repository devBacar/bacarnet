import {
  categoriaPorReglas,
  type FilaParaReglas,
  type ReglaCategorizacionAplicable,
} from '../../movimientos/domain/regla-categorizacion.js'

export const SIN_CLASIFICAR = 'Sin clasificar'

/**
 * La categoría de la fila es la del movimiento de BacarNet que emparejó.
 * Si no hubo pareja, la que darían las reglas. Si tampoco, Sin clasificar.
 */
export function nombreCategoriaFila(input: {
  categoriaIdEmparejada: string | null
  fila: FilaParaReglas
  reglas: readonly ReglaCategorizacionAplicable[]
  nombres: ReadonlyMap<string, string>
}): string {
  const categoriaId = input.categoriaIdEmparejada ?? categoriaPorReglas(input.fila, input.reglas)
  if (!categoriaId) return SIN_CLASIFICAR
  return input.nombres.get(categoriaId) ?? SIN_CLASIFICAR
}

export function aplicarCategorias(
  filas: readonly FilaParaReglas[],
  categoriaIdPorFila: readonly (string | null)[],
  reglas: readonly ReglaCategorizacionAplicable[],
  nombres: ReadonlyMap<string, string>,
): string[] {
  return filas.map((fila, indice) =>
    nombreCategoriaFila({
      categoriaIdEmparejada: categoriaIdPorFila[indice] ?? null,
      fila,
      reglas,
      nombres,
    }),
  )
}
