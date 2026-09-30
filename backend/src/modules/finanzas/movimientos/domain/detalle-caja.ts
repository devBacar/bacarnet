/**
 * Una palabra (o una frase corta) para la planilla de caja.
 * La tabla de categorías vive acá: es el único lugar para cambiar una sugerencia.
 */

export const DETALLE_CAJA_MAX = 40

export interface FilaDetalleCaja {
  /** Nombre de la categoría, tal como está en la semilla. */
  categoria: string
  detalle: string
}

export const TABLA_DETALLE_CAJA: readonly FilaDetalleCaja[] = [
  { categoria: 'Cobros de clientes', detalle: 'cliente' },
  { categoria: 'Movimiento interno', detalle: 'entre cuentas' },
  { categoria: 'Impuesto al cheque', detalle: 'imp. cheque' },
  { categoria: 'Ingresos Brutos', detalle: 'iibb' },
  { categoria: 'IVA', detalle: 'iva' },
  { categoria: 'Pago de impuestos (VEP)', detalle: 'arca' },
  { categoria: 'Sueldos', detalle: 'sueldos' },
  { categoria: 'Comisiones bancarias', detalle: 'gastos banco' },
  { categoria: 'Mantenimiento de cuenta', detalle: 'gastos banco' },
  { categoria: 'Mantenimiento', detalle: 'gastos banco' },
  { categoria: 'Chequeras', detalle: 'gastos banco' },
  { categoria: 'Cheques pagados', detalle: 'cheques' },
  { categoria: 'Cheques depositados', detalle: 'dep cheque' },
  { categoria: 'Descuento de documentos', detalle: 'desc doc' },
  { categoria: 'Fondos comunes (FCI)', detalle: 'fondo' },
  { categoria: 'Fondos comunes', detalle: 'fondo' },
  { categoria: 'Préstamos', detalle: 'préstamo' },
  { categoria: 'Leasing', detalle: 'leasing' },
]

const BANCOS_EN_TEXTO: ReadonlyArray<{ palabra: 'julio' | 'patagonia' | 'bancor'; re: RegExp }> = [
  { palabra: 'julio', re: /\bjulio\b/ },
  { palabra: 'patagonia', re: /\bpatagonia\b/ },
  { palabra: 'bancor', re: /\bbancor\b|\bcordoba\b/ },
]

const PREFIJOS_BANCO = ['transferencia inmediata', 'transferencia', 'transf', 'trf', 'debito', 'credito']

function sinAcento(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
}

function claveCategoria(nombre: string): string {
  return sinAcento(nombre).replace(/\s+/g, ' ').trim()
}

const DETALLE_POR_CLAVE = new Map<string, string>(
  TABLA_DETALLE_CAJA.map((fila) => [claveCategoria(fila.categoria), fila.detalle]),
)

/** Palabras de la tabla, más los bancos que puede sugerir un movimiento interno. */
export function palabrasDetalleCajaPorDefecto(): string[] {
  const vistas = new Set<string>()
  const palabras: string[] = []
  const sumar = (texto: string) => {
    if (vistas.has(texto)) return
    vistas.add(texto)
    palabras.push(texto)
  }
  for (const fila of TABLA_DETALLE_CAJA) sumar(fila.detalle)
  sumar('julio')
  sumar('bancor')
  sumar('patagonia')
  return palabras
}

export function normalizarDetalleCaja(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw !== 'string') throw new Error('El detalle tiene que ser texto')
  const texto = raw.trim().toLocaleLowerCase('es').replace(/\s+/g, ' ')
  if (!texto) return null
  if (texto.length > DETALLE_CAJA_MAX) {
    throw new Error(`El detalle puede tener hasta ${DETALLE_CAJA_MAX} caracteres`)
  }
  if (texto.includes('/')) throw new Error('El detalle no puede incluir /')
  if (!/[0-9a-záéíóúüñ]/i.test(texto)) {
    throw new Error('El detalle tiene que tener alguna letra o número')
  }
  return texto
}

/** Texto del banco, corto, para cuando no hay categoría. */
export function textoBancoCorto(descripcion: string): string {
  let texto = descripcion
    .toLocaleLowerCase('es')
    .replace(/[./]+/g, ' ')
    .replace(/[^0-9a-záéíóúüñ\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  for (const prefijo of PREFIJOS_BANCO) {
    if (texto === prefijo) {
      texto = ''
      break
    }
    if (texto.startsWith(`${prefijo} `)) {
      texto = texto.slice(prefijo.length).trim()
      break
    }
  }
  if (texto.length > 24) {
    const corte = texto.slice(0, 24)
    const espacio = corte.lastIndexOf(' ')
    texto = (espacio > 8 ? corte.slice(0, espacio) : corte).trim()
  }
  return texto || 'movimiento'
}

export function bancoPropioPalabra(bancoNombre: string): 'julio' | 'patagonia' | 'bancor' | null {
  const n = sinAcento(bancoNombre)
  if (/\bjulio\b/.test(n)) return 'julio'
  if (/\bpatagonia\b/.test(n)) return 'patagonia'
  if (/\bbancor\b/.test(n) || /\bcordoba\b/.test(n)) return 'bancor'
  return null
}

/** El otro banco, si el texto lo nombra. El banco de la cuenta no cuenta. */
export function otroBancoEnTexto(
  texto: string,
  bancoPropio: 'julio' | 'patagonia' | 'bancor' | null,
): 'julio' | 'patagonia' | 'bancor' | null {
  const n = sinAcento(texto)
  let mejor: { index: number; palabra: 'julio' | 'patagonia' | 'bancor' } | null = null
  for (const ref of BANCOS_EN_TEXTO) {
    const match = ref.re.exec(n)
    if (!match || ref.palabra === bancoPropio) continue
    if (!mejor || match.index < mejor.index) mejor = { index: match.index, palabra: ref.palabra }
  }
  return mejor?.palabra ?? null
}

export function sugerirDetalleCaja(input: {
  categoriaNombre: string | null
  contraparteNombre: string | null
  descripcion: string
  bancoNombre: string
}): string {
  const categoria = input.categoriaNombre?.trim() || null
  if (categoria && claveCategoria(categoria) === 'movimiento interno') {
    const propio = bancoPropioPalabra(input.bancoNombre)
    const texto = `${input.contraparteNombre ?? ''} ${input.descripcion}`
    return otroBancoEnTexto(texto, propio) ?? 'entre cuentas'
  }
  if (categoria) {
    return DETALLE_POR_CLAVE.get(claveCategoria(categoria)) ?? textoBancoCorto(categoria)
  }
  return textoBancoCorto(input.descripcion)
}

export function resolverDetalleCaja(input: {
  detalleCaja: string | null
  detalleCajaOrigen: 'manual' | 'sugerido' | null
  categoriaNombre: string | null
  contraparteNombre: string | null
  descripcion: string
  bancoNombre: string
}): { detalle: string; origen: 'manual' | 'sugerido' } {
  const manual = input.detalleCajaOrigen === 'manual' ? input.detalleCaja?.trim() : ''
  if (manual) {
    return { detalle: manual.toLocaleLowerCase('es').replace(/\s+/g, ' '), origen: 'manual' }
  }
  return {
    detalle: sugerirDetalleCaja(input),
    origen: 'sugerido',
  }
}

export interface DetalleCajaListado {
  texto: string
  veces: number
  propio: boolean
}

/** Las del encargado primero (por uso) y después las de la tabla, también por uso. */
export function mezclarDetallesCaja(input: {
  tabla: readonly string[]
  guardados: ReadonlyArray<{ texto: string; veces: number }>
}): DetalleCajaListado[] {
  const veces = new Map<string, number>()
  for (const item of input.guardados) {
    const texto = item.texto.trim().toLocaleLowerCase('es').replace(/\s+/g, ' ')
    if (!texto || !Number.isFinite(item.veces) || item.veces < 0) continue
    veces.set(texto, (veces.get(texto) ?? 0) + item.veces)
  }
  const tabla = new Set(input.tabla.map((texto) => texto.trim().toLocaleLowerCase('es')))
  const propios: DetalleCajaListado[] = []
  const deTabla: DetalleCajaListado[] = []
  const vistos = new Set<string>()
  for (const [texto, n] of veces) {
    const fila = { texto, veces: n, propio: !tabla.has(texto) }
    if (fila.propio) propios.push(fila)
    else deTabla.push(fila)
    vistos.add(texto)
  }
  for (const texto of tabla) {
    if (vistos.has(texto)) continue
    deTabla.push({ texto, veces: 0, propio: false })
  }
  const porUso = (a: DetalleCajaListado, b: DetalleCajaListado) =>
    b.veces - a.veces || a.texto.localeCompare(b.texto, 'es')
  propios.sort(porUso)
  deTabla.sort(porUso)
  return [...propios, ...deTabla]
}
