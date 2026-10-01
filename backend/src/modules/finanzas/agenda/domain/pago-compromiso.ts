import type { CompromisoEstado, MedioPago } from './agenda.types.js'

export type ClaseChequePago = 'cartera' | 'propio'

export interface PagoRegistradoVista {
  fecha: string
  montoCentavos: number
  medio: MedioPago
  referenciaId: string | null
  registradoPor: string
  registradoAt: unknown
  /** Ausentes en pagos viejos. Si vienen mal tipeados, se ignoran y el pago sigue valiendo. */
  chequeId?: string | null
  cajaId?: string | null
  cuentaId?: string | null
  transferenciaId?: string | null
  movimientoId?: string | null
  claseCheque?: ClaseChequePago | null
  marcadoAMano?: boolean
}

export interface DatosNuevoPago {
  montoSolicitado: number | null
  fecha: string
  medio: MedioPago
  referenciaId: string | null
  registradoPor: string
  registradoAt: unknown
  chequeId?: string | null
  cajaId?: string | null
  cuentaId?: string | null
  transferenciaId?: string | null
  movimientoId?: string | null
  claseCheque?: ClaseChequePago | null
  marcadoAMano?: boolean
}

const MEDIOS: readonly MedioPago[] = ['transferencia', 'cheque', 'efectivo']

export function esPagoRegistrado(value: unknown): value is PagoRegistradoVista {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.fecha === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.fecha) &&
    typeof row.montoCentavos === 'number' &&
    Number.isInteger(row.montoCentavos) &&
    row.montoCentavos > 0 &&
    typeof row.medio === 'string' &&
    MEDIOS.includes(row.medio as MedioPago) &&
    (row.referenciaId === null || typeof row.referenciaId === 'string') &&
    typeof row.registradoPor === 'string' &&
    row.registradoPor.trim().length > 0
  )
}

export function listarPagos(raw: unknown): PagoRegistradoVista[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(esPagoRegistrado)
}

/** Pagado de antes, sin detalle de pagos: cuenta como el importe completo. */
export function pagadoLegacyCompleto(input: {
  estado: string
  pagos: readonly PagoRegistradoVista[]
}): boolean {
  return input.estado === 'pagado' && input.pagos.length === 0
}

export function acumuladoDePagos(pagos: readonly { montoCentavos: number }[]): number {
  return pagos.reduce((suma, pago) => suma + pago.montoCentavos, 0)
}

export function restanteAPagarCentavos(input: {
  estado: string
  montoCentavos: number
  pagos: readonly PagoRegistradoVista[]
}): number {
  if (pagadoLegacyCompleto(input)) return 0
  return Math.max(0, input.montoCentavos - acumuladoDePagos(input.pagos))
}

/** Lo que se anota en este pago: lo que falta, o un monto menor. */
export function resolverMontoPago(restante: number, montoSolicitado: number | null): number {
  const monto = montoSolicitado == null ? restante : montoSolicitado
  if (!Number.isInteger(monto) || monto <= 0) {
    throw new Error('Indicá un monto mayor a cero')
  }
  if (monto > restante) {
    throw new Error('El monto supera lo que falta pagar')
  }
  return monto
}

function idOpcional(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const texto = value.trim()
  return texto || null
}

function detalleOpcionalPago(pago: DatosNuevoPago): Partial<PagoRegistradoVista> {
  const extra: Partial<PagoRegistradoVista> = {}
  const chequeId = idOpcional(pago.chequeId)
  const cajaId = idOpcional(pago.cajaId)
  const cuentaId = idOpcional(pago.cuentaId)
  const transferenciaId = idOpcional(pago.transferenciaId)
  const movimientoId = idOpcional(pago.movimientoId)
  if (chequeId) extra.chequeId = chequeId
  if (cajaId) extra.cajaId = cajaId
  if (cuentaId) extra.cuentaId = cuentaId
  if (transferenciaId) extra.transferenciaId = transferenciaId
  if (movimientoId) extra.movimientoId = movimientoId
  if (pago.claseCheque === 'cartera' || pago.claseCheque === 'propio') extra.claseCheque = pago.claseCheque
  if (pago.marcadoAMano === true) extra.marcadoAMano = true
  return extra
}

export function leerMontoSolicitado(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error('Indicá un monto mayor a cero')
  }
  return value
}

export type DecisionPago =
  | { tipo: 'ya_pagado' }
  | {
      tipo: 'aplicado'
      pagos: PagoRegistradoVista[]
      estado: CompromisoEstado
      completo: boolean
      montoCentavos: number
      acumuladoCentavos: number
    }

export function decidirPagoCompromiso(
  actual: {
    estado: CompromisoEstado
    montoCentavos: number
    pagos: readonly PagoRegistradoVista[]
  },
  pago: DatosNuevoPago,
): DecisionPago {
  const restante = restanteAPagarCentavos(actual)
  if (restante <= 0) return { tipo: 'ya_pagado' }

  const monto = resolverMontoPago(restante, pago.montoSolicitado)

  const pagos: PagoRegistradoVista[] = [
    ...actual.pagos,
    {
      fecha: pago.fecha,
      montoCentavos: monto,
      medio: pago.medio,
      referenciaId: pago.referenciaId,
      registradoPor: pago.registradoPor,
      registradoAt: pago.registradoAt,
      ...detalleOpcionalPago(pago),
    },
  ]
  const acumuladoCentavos = acumuladoDePagos(pagos)
  const completo = acumuladoCentavos >= actual.montoCentavos
  const estado: CompromisoEstado = completo ? 'pagado' : actual.estado
  return {
    tipo: 'aplicado',
    pagos,
    estado,
    completo,
    montoCentavos: monto,
    acumuladoCentavos,
  }
}

/**
 * Si el importe nuevo queda por encima de lo ya pagado, el compromiso vuelve a pendiente.
 * Un pagado viejo sin `pagos` sigue pagado: ese registro no tiene detalle para comparar.
 */
export function estadoTrasEditarImporte(input: {
  estado: CompromisoEstado
  pagos: readonly PagoRegistradoVista[]
  montoNuevo: number
}): { estado: CompromisoEstado; reabre: boolean } {
  if (!Number.isInteger(input.montoNuevo) || input.montoNuevo <= 0) {
    throw new Error('montoCentavos inválido')
  }
  if (pagadoLegacyCompleto(input)) {
    return { estado: input.estado, reabre: false }
  }
  const acumulado = acumuladoDePagos(input.pagos)
  if (input.montoNuevo < acumulado) {
    throw new Error('El importe no puede ser menor que lo ya pagado')
  }
  if (acumulado >= input.montoNuevo) {
    return { estado: 'pagado', reabre: false }
  }
  if (input.estado === 'pagado') {
    return { estado: 'pendiente', reabre: true }
  }
  return { estado: input.estado, reabre: false }
}
