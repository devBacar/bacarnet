/**
 * Reglas de auto-categorización. Tres tipos, de mayor a menor prioridad:
 *  1. CUIT de la contraparte
 *  2. texto exacto de la descripción (espacios de más no cuentan)
 *  3. código de Interbanking (`codeDescriptionIb`)
 *
 * Una categoría ya puesta (a mano o por una corrida anterior) no se pisa.
 * Los documentos viejos no tienen `tipo`: se leen como descripción.
 */

const DESCRIPCION_MAX = 200

export type TipoReglaCategorizacion = 'descripcion' | 'codigoIb' | 'cuit'

export interface ReglaCategorizacionAplicable {
  tipo?: TipoReglaCategorizacion
  descripcionKey?: string
  codigoIbKey?: string
  cuitKey?: string
  categoriaId: string
}

export interface FilaParaReglas {
  descripcion?: unknown
  codeDescriptionIb?: unknown
  customerCuit?: unknown
  categoriaId?: string | null
}

export interface IndiceReglasCategorizacion {
  porCuit: Map<string, string>
  porDescripcion: Map<string, string>
  porCodigoIb: Map<string, string>
}

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

/** Misma clave que la descripción: trim y espacios colapsados. */
export function validarCodigoIbRegla(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('El código de Interbanking tiene que ser texto')
  const codigo = claveDescripcionRegla(raw)
  if (!codigo) throw new Error('El código de Interbanking es obligatorio')
  if (codigo.length > DESCRIPCION_MAX) {
    throw new Error(`El código de Interbanking puede tener hasta ${DESCRIPCION_MAX} caracteres`)
  }
  return codigo
}

/** Solo dígitos. Tiene que quedar en 11; si no, no es un CUIT. */
export function validarCuitRegla(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('El CUIT tiene que ser texto')
  const cuit = raw.replace(/\D/g, '')
  if (!/^\d{11}$/.test(cuit)) throw new Error('El CUIT tiene que tener 11 dígitos')
  return cuit
}

export function digitosCuit(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\D/g, '')
}

export function reglaAplicableDesdeDocumento(data: {
  tipo?: unknown
  descripcionKey?: unknown
  codigoIbKey?: unknown
  cuitKey?: unknown
  categoriaId?: unknown
}): ReglaCategorizacionAplicable | null {
  if (typeof data.categoriaId !== 'string' || !data.categoriaId) return null
  const tipo: TipoReglaCategorizacion =
    data.tipo === 'codigoIb' || data.tipo === 'cuit' ? data.tipo : 'descripcion'
  if (tipo === 'cuit') {
    if (typeof data.cuitKey !== 'string' || !data.cuitKey) return null
    return { tipo, cuitKey: data.cuitKey, categoriaId: data.categoriaId }
  }
  if (tipo === 'codigoIb') {
    if (typeof data.codigoIbKey !== 'string' || !data.codigoIbKey) return null
    return { tipo, codigoIbKey: data.codigoIbKey, categoriaId: data.categoriaId }
  }
  if (typeof data.descripcionKey !== 'string' || !data.descripcionKey) return null
  return { tipo: 'descripcion', descripcionKey: data.descripcionKey, categoriaId: data.categoriaId }
}

function tipoDe(regla: ReglaCategorizacionAplicable): TipoReglaCategorizacion {
  if (regla.tipo === 'cuit' || regla.tipo === 'codigoIb' || regla.tipo === 'descripcion') return regla.tipo
  return 'descripcion'
}

/** Primera regla de cada clave gana. El resto se ignora. */
export function indexarReglas(reglas: readonly ReglaCategorizacionAplicable[]): IndiceReglasCategorizacion {
  const porCuit = new Map<string, string>()
  const porDescripcion = new Map<string, string>()
  const porCodigoIb = new Map<string, string>()
  for (const regla of reglas) {
    const tipo = tipoDe(regla)
    if (tipo === 'cuit') {
      if (regla.cuitKey && !porCuit.has(regla.cuitKey)) porCuit.set(regla.cuitKey, regla.categoriaId)
    } else if (tipo === 'codigoIb') {
      if (regla.codigoIbKey && !porCodigoIb.has(regla.codigoIbKey)) porCodigoIb.set(regla.codigoIbKey, regla.categoriaId)
    } else if (regla.descripcionKey && !porDescripcion.has(regla.descripcionKey)) {
      porDescripcion.set(regla.descripcionKey, regla.categoriaId)
    }
  }
  return { porCuit, porDescripcion, porCodigoIb }
}

/**
 * Categoría que correspondería, sin mirar la que ya tiene la fila.
 * Prioridad: CUIT, después descripción, después código de Interbanking.
 */
export function categoriaPorIndice(fila: FilaParaReglas, indice: IndiceReglasCategorizacion): string | null {
  const cuit = digitosCuit(fila.customerCuit)
  if (cuit) {
    const porCuit = indice.porCuit.get(cuit)
    if (porCuit) return porCuit
  }
  const descripcion = typeof fila.descripcion === 'string' ? claveDescripcionRegla(fila.descripcion) : ''
  if (descripcion) {
    const porDescripcion = indice.porDescripcion.get(descripcion)
    if (porDescripcion) return porDescripcion
  }
  const codigo = typeof fila.codeDescriptionIb === 'string' ? claveDescripcionRegla(fila.codeDescriptionIb) : ''
  if (codigo) {
    const porCodigo = indice.porCodigoIb.get(codigo)
    if (porCodigo) return porCodigo
  }
  return null
}

export function categoriaPorReglas(fila: FilaParaReglas, reglas: readonly ReglaCategorizacionAplicable[]): string | null {
  if (reglas.length === 0) return null
  return categoriaPorIndice(fila, indexarReglas(reglas))
}

/**
 * Completa `categoriaId` solo en filas que todavía no tienen una.
 * Una categoría puesta a mano (o reaplicada por huella) pesa más que cualquier regla.
 */
export function aplicarReglasAFilas<T extends FilaParaReglas>(
  filas: T[],
  reglas: readonly ReglaCategorizacionAplicable[],
): { filas: Array<T & { categoriaId: string | null }>; categorizadas: number } {
  if (reglas.length === 0) {
    return { filas: filas.map((fila) => ({ ...fila, categoriaId: fila.categoriaId ?? null })), categorizadas: 0 }
  }
  const indice = indexarReglas(reglas)
  let categorizadas = 0
  const resultado = filas.map((fila) => {
    if (fila.categoriaId) return { ...fila, categoriaId: fila.categoriaId }
    const categoriaId = categoriaPorIndice(fila, indice)
    if (categoriaId) categorizadas += 1
    return { ...fila, categoriaId }
  })
  return { filas: resultado, categorizadas }
}
