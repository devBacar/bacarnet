import type { ContraparteGuardada } from './contraparte.types.js'
import { claveTexto, nombreContraparteLimpio } from './normalizar.js'

/**
 * Textos del banco para cheques propios que se debitan (categoría Cheques propios; antes Cheques pagados).
 * La lista sale de la semilla de categorías; un texto nuevo se agrega acá.
 */
const TEXTOS_DEBITO_CHEQUE_PROPIO = [
  'CHEQUE CAMARA LOCAL',
  'ECHEQ CAMARA',
  'CH CAMAR RECIB.ACH',
  'CH DEP 72',
  'ECHEQ PROPIO DEPOSIT',
  'DEB AUT RECIB CAMARA',
  'DEB.P/CANJE INTERNO',
  'CH.RECH.DEP.CAM.INT.',
  'CH.RECH.FORMA',
  'DEB.VS./RECH.VALORES',
]

/** Textos del banco para cheques depositados (categoría Cheques depositados). */
const TEXTOS_CREDITO_CHEQUE_DEPOSITADO = ['DEPOSITO ECHEQ', 'DEP. VALORES CAMARA', 'CH DEP 48']

export interface ChequeParaContraparte {
  id: string
  numero: string
  direccion: 'recibido' | 'emitido'
  montoCentavos: number
  fechaEmision: string
  fechaPago: string
  emisor: string | null
  cliente: string | null
  destinatario: string | null
  movimientoBancarioId?: string | null
  estado?: string | null
}

export interface MovimientoCheque {
  tipo: string
  montoCentavos: number
  fechaProceso: string
  descripcion: string
  codeDescriptionIb: string | null
  voucherNumber: string | null
  correlativeNumber: string | null
  categoriaNombre: string | null
}

/** Solo dígitos, sin ceros a la izquierda. Vacío si no queda ningún dígito. */
export function numeroComparable(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '').replace(/^0+/, '')
  return digits.length > 0 ? digits : null
}

function textoIncluye(
  mov: { descripcion: string; codeDescriptionIb: string | null },
  textos: readonly string[],
): boolean {
  const desc = claveTexto(mov.descripcion)
  const code = claveTexto(mov.codeDescriptionIb)
  return textos.some((texto) => {
    const clave = claveTexto(texto)
    if (!clave) return false
    return desc.includes(clave) || code.includes(clave)
  })
}

/** `emitido` = débito de cheque propio. `recibido` = crédito de cheque depositado. */
export function claseMovimientoCheque(mov: {
  tipo: string
  descripcion: string
  codeDescriptionIb: string | null
  categoriaNombre: string | null
}): 'emitido' | 'recibido' | null {
  const categoria = claveTexto(mov.categoriaNombre)
  if (
    mov.tipo === 'debito' &&
    (categoria === claveTexto('Cheques propios') ||
      categoria === claveTexto('Cheques pagados') ||
      textoIncluye(mov, TEXTOS_DEBITO_CHEQUE_PROPIO))
  ) {
    return 'emitido'
  }
  if (
    mov.tipo === 'credito' &&
    (categoria === claveTexto('Cheques depositados') || textoIncluye(mov, TEXTOS_CREDITO_CHEQUE_DEPOSITADO))
  ) {
    return 'recibido'
  }
  return null
}

function fechaBaseDeposito(cheque: ChequeParaContraparte): string {
  if (cheque.fechaPago && cheque.fechaEmision && cheque.fechaPago !== cheque.fechaEmision) return cheque.fechaPago
  return cheque.fechaEmision || cheque.fechaPago
}

function diffDias(isoA: string, isoB: string): number {
  const a = new Date(isoA + 'T00:00:00Z')
  const b = new Date(isoB + 'T00:00:00Z')
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)
}

function porMontoYFecha(mov: MovimientoCheque, cheques: readonly ChequeParaContraparte[]): ChequeParaContraparte[] {
  return cheques.filter((cheque) => {
    if (cheque.montoCentavos !== mov.montoCentavos) return false
    const base = fechaBaseDeposito(cheque)
    if (!base || !mov.fechaProceso) return false
    const diff = diffDias(mov.fechaProceso, base)
    const maxDias = cheque.estado === 'rechazado' ? 15 : 5
    return diff >= -1 && diff <= maxDias
  })
}

function matchPorNumero(
  ref: string | null,
  delLado: readonly ChequeParaContraparte[],
  montoCentavos: number,
): ChequeParaContraparte[] | null {
  const digits = numeroComparable(ref)
  if (!digits) return null

  const exacto = delLado.filter(
    (cheque) => numeroComparable(cheque.numero) === digits && cheque.montoCentavos === montoCentavos,
  )
  if (exacto.length === 1) return exacto

  if (digits.length >= 6) {
    const porSufijo = delLado.filter((cheque) => {
      const nd = numeroComparable(cheque.numero)
      return nd !== null && nd.length > digits.length && nd.endsWith(digits) && cheque.montoCentavos === montoCentavos
    })
    if (porSufijo.length === 1) return porSufijo
  }

  return null
}

/**
 * Primero por número exacto (voucher contra `numero`, solo dígitos y sin ceros a la izquierda).
 * Si no alcanza, por sufijo: cheques físicos usan número largo (ej. 305-001-5000-04142765)
 * pero el banco reporta solo los últimos dígitos como voucher (ej. 4142765).
 * Si el voucher es null, prueba con correlativeNumber como referencia alternativa.
 * Último recurso: monto exacto y fecha del movimiento dentro de la ventana -1/+5 días;
 * si hay varios candidatos por monto, se queda con el más cercano en fecha.
 */
export function chequesCandidatos(
  mov: MovimientoCheque,
  cheques: readonly ChequeParaContraparte[],
  options?: { soloNumero?: boolean },
): ChequeParaContraparte[] {
  const direccion = claseMovimientoCheque(mov)
  if (!direccion) return []
  const delLado = cheques.filter((cheque) => cheque.direccion === direccion)

  const porVoucher = matchPorNumero(mov.voucherNumber, delLado, mov.montoCentavos)
  if (porVoucher) return porVoucher

  const porCorrelative = matchPorNumero(mov.correlativeNumber, delLado, mov.montoCentavos)
  if (porCorrelative) return porCorrelative

  if (options?.soloNumero) return []

  const porMonto = porMontoYFecha(mov, delLado)
  if (porMonto.length === 1) return porMonto
  if (porMonto.length > 1 && mov.fechaProceso) {
    const conDiff = porMonto.map((cheque) => ({
      cheque,
      diff: Math.abs(diffDias(mov.fechaProceso, fechaBaseDeposito(cheque))),
    }))
    conDiff.sort((a, b) => a.diff - b.diff)
    if (conDiff[0].diff < conDiff[1].diff) return [conDiff[0].cheque]
  }
  return []
}

export function nombreContraparteCheque(cheque: ChequeParaContraparte): string | null {
  if (cheque.direccion === 'emitido') {
    const numero = cheque.numero.trim()
    if (!numero) return null
    const destino = nombreContraparteLimpio(cheque.destinatario)
    return destino ? `Cheque N.º ${numero} a ${destino}` : `Cheque N.º ${numero}`
  }
  const quien = nombreContraparteLimpio(cheque.cliente) ?? nombreContraparteLimpio(cheque.emisor)
  if (!quien) return null
  return `Cheque de ${quien}`
}

export function contraparteDeCheque(cheque: ChequeParaContraparte): ContraparteGuardada {
  return {
    nombre: nombreContraparteCheque(cheque),
    cuit: null,
    origen: 'cheque',
  }
}
