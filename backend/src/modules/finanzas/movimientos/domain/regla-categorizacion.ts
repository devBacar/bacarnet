/**
 * Regla de auto-categorización: un texto de descripción exacto → una categoría.
 *
 * La comparación es exacta en mayúsculas/minúsculas; solo se recortan espacios
 * sobrantes. El banco repite estos textos tal cual (IVA, comisiones, códigos de
 * operación), así que una regla por texto alcanza para que los movimientos
 * nuevos entren ya categorizados.
 */

const DESCRIPCION_MAX = 200

export function claveDescripcionRegla(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export function validarDescripcionRegla(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('La descripción de la regla tiene que ser texto')
  const descripcion = claveDescripcionRegla(raw)
  if (!descripcion) throw new Error('La descripción de la regla es obligatoria')
  if (descripcion.length > DESCRIPCION_MAX) {
    throw new Error(`La descripción de la regla puede tener hasta ${DESCRIPCION_MAX} caracteres`)
  }
  return descripcion
}

export interface ReglaCategorizacionAplicable {
  descripcionKey: string
  categoriaId: string
}

/**
 * Completa `categoriaId` en filas que todavía no tienen una. Una categoría puesta a
 * mano (o reaplicada por huella) pesa más que la regla y se respeta.
 */
export function aplicarReglasAFilas<T extends { descripcion?: unknown; categoriaId?: string | null }>(
  filas: T[],
  reglas: ReglaCategorizacionAplicable[],
): { filas: Array<T & { categoriaId: string | null }>; categorizadas: number } {
  if (reglas.length === 0) {
    return { filas: filas.map((fila) => ({ ...fila, categoriaId: fila.categoriaId ?? null })), categorizadas: 0 }
  }
  const porDescripcion = new Map(reglas.map((regla) => [regla.descripcionKey, regla.categoriaId]))
  let categorizadas = 0
  const resultado = filas.map((fila) => {
    if (fila.categoriaId) return { ...fila, categoriaId: fila.categoriaId }
    const descripcion = typeof fila.descripcion === 'string' ? claveDescripcionRegla(fila.descripcion) : ''
    const categoriaId = descripcion ? porDescripcion.get(descripcion) ?? null : null
    if (categoriaId) categorizadas += 1
    return { ...fila, categoriaId }
  })
  return { filas: resultado, categorizadas }
}
