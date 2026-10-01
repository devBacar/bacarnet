import type { CompromisoEstado, MedioPago } from '../../agenda/domain/agenda.types.js'
import {
  decidirPagoCompromiso,
  restanteAPagarCentavos,
  type PagoRegistradoVista,
} from '../../agenda/domain/pago-compromiso.js'

/** Transferencia armada que todavía no se pagó: reserva ese monto para que no se pague dos veces. */
export interface TransferenciaEnFirma {
  transferenciaId: string
  montoCentavos: number
}

export function listarTransferenciasEnFirma(raw: unknown): TransferenciaEnFirma[] {
  if (!Array.isArray(raw)) return []
  const salida: TransferenciaEnFirma[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const transferenciaId = typeof row.transferenciaId === 'string' ? row.transferenciaId.trim() : ''
    const montoCentavos = row.montoCentavos
    if (!transferenciaId) continue
    if (typeof montoCentavos !== 'number' || !Number.isInteger(montoCentavos) || montoCentavos <= 0) continue
    salida.push({ transferenciaId, montoCentavos })
  }
  return salida
}

export function montoEnFirmaCentavos(items: readonly TransferenciaEnFirma[]): number {
  return items.reduce((suma, item) => suma + item.montoCentavos, 0)
}

/**
 * Lo que todavía se puede pagar a mano.
 * Descuenta lo ya pagado y lo que está en una transferencia esperando firma.
 * Si toda la deuda está en una transferencia armada, no queda nada para pagar por otro lado.
 */
export function faltaPagarCentavos(input: {
  estado: string
  montoCentavos: number
  pagos: readonly PagoRegistradoVista[]
  transferenciasEnFirma?: readonly TransferenciaEnFirma[]
}): number {
  if (input.estado === 'confeccionada_pendiente_autorizacion') return 0
  const restante = restanteAPagarCentavos({
    estado: input.estado,
    montoCentavos: input.montoCentavos,
    pagos: input.pagos,
  })
  return Math.max(0, restante - montoEnFirmaCentavos(input.transferenciasEnFirma ?? []))
}

export type DecisionVinculoTransferencia =
  | { ok: false; error: string }
  | {
      ok: true
      modo: 'total'
      estado: 'confeccionada_pendiente_autorizacion'
      transferenciaConfeccionadaId: string
      transferenciasEnFirma: TransferenciaEnFirma[]
    }
  | {
      ok: true
      modo: 'parcial'
      estado: CompromisoEstado
      transferenciasEnFirma: TransferenciaEnFirma[]
    }

/**
 * Si la transferencia cubre todo lo que falta (y no hay otra en firma), el compromiso queda
 * esperando la firma, como hasta ahora. Si es menor, sigue pendiente y solo se reserva el monto.
 */
export function decidirVinculoTransferencia(
  actual: {
    estado: CompromisoEstado
    montoCentavos: number
    pagos: readonly PagoRegistradoVista[]
    transferenciasEnFirma: readonly TransferenciaEnFirma[]
  },
  transferencia: { transferenciaId: string; montoCentavos: number },
): DecisionVinculoTransferencia {
  if (actual.estado === 'pagado') return { ok: false, error: 'Ese pago ya está hecho' }
  if (actual.estado === 'confeccionada_pendiente_autorizacion') {
    return { ok: false, error: 'Ese pago ya tiene una transferencia armada' }
  }
  if (!Number.isInteger(transferencia.montoCentavos) || transferencia.montoCentavos <= 0) {
    return { ok: false, error: 'Indicá un monto mayor a cero' }
  }
  const enFirma = listarTransferenciasEnFirma(actual.transferenciasEnFirma)
  if (enFirma.some((item) => item.transferenciaId === transferencia.transferenciaId)) {
    return {
      ok: true,
      modo: 'parcial',
      estado: actual.estado,
      transferenciasEnFirma: enFirma,
    }
  }
  const libre = faltaPagarCentavos({ ...actual, transferenciasEnFirma: enFirma })
  if (libre <= 0) return { ok: false, error: 'Ese pago ya está cubierto' }
  if (transferencia.montoCentavos > libre) return { ok: false, error: 'El monto supera lo que falta pagar' }

  const cubreTodo = transferencia.montoCentavos >= libre && enFirma.length === 0
  if (cubreTodo) {
    return {
      ok: true,
      modo: 'total',
      estado: 'confeccionada_pendiente_autorizacion',
      transferenciaConfeccionadaId: transferencia.transferenciaId,
      transferenciasEnFirma: [],
    }
  }
  return {
    ok: true,
    modo: 'parcial',
    estado: actual.estado,
    transferenciasEnFirma: [
      ...enFirma,
      { transferenciaId: transferencia.transferenciaId, montoCentavos: transferencia.montoCentavos },
    ],
  }
}

export function aplicarTransferenciaHecha(
  actual: {
    estado: CompromisoEstado
    montoCentavos: number
    pagos: readonly PagoRegistradoVista[]
    transferenciasEnFirma: readonly TransferenciaEnFirma[]
    transferenciaConfeccionadaId: string | null
  },
  pago: {
    transferenciaId: string
    montoCentavos: number
    fecha: string
    registradoPor: string
    registradoAt: unknown
  },
) {
  const enFirma = listarTransferenciasEnFirma(actual.transferenciasEnFirma)
  const parcial = enFirma.find((item) => item.transferenciaId === pago.transferenciaId)
  const esTotal =
    actual.estado === 'confeccionada_pendiente_autorizacion' &&
    actual.transferenciaConfeccionadaId === pago.transferenciaId
  const montoSolicitado = parcial
    ? parcial.montoCentavos
    : esTotal
      ? null
      : pago.montoCentavos > 0
        ? pago.montoCentavos
        : null
  const decision = decidirPagoCompromiso(
    { estado: actual.estado, montoCentavos: actual.montoCentavos, pagos: actual.pagos },
    {
      montoSolicitado,
      fecha: pago.fecha,
      medio: 'transferencia' satisfies MedioPago,
      referenciaId: pago.transferenciaId,
      registradoPor: pago.registradoPor,
      registradoAt: pago.registradoAt,
    },
  )
  return {
    decision,
    transferenciasEnFirma: enFirma.filter((item) => item.transferenciaId !== pago.transferenciaId),
    montoRegistrado: decision.tipo === 'aplicado' ? decision.montoCentavos : 0,
  }
}

/** Al rechazar o anular, el monto reservado vuelve a estar libre. */
export function aplicarTransferenciaRechazada(
  actual: {
    estado: CompromisoEstado
    transferenciaConfeccionadaId: string | null
    transferenciasEnFirma: readonly TransferenciaEnFirma[]
  },
  transferenciaId: string,
): {
  cambio: boolean
  estado: CompromisoEstado
  transferenciaConfeccionadaId: string | null
  transferenciasEnFirma: TransferenciaEnFirma[]
} {
  const enFirma = listarTransferenciasEnFirma(actual.transferenciasEnFirma)
  const siguientes = enFirma.filter((item) => item.transferenciaId !== transferenciaId)
  const estabaEnFirma = siguientes.length !== enFirma.length
  const esTotal =
    actual.estado === 'confeccionada_pendiente_autorizacion' &&
    actual.transferenciaConfeccionadaId === transferenciaId
  if (!estabaEnFirma && !esTotal) {
    return {
      cambio: false,
      estado: actual.estado,
      transferenciaConfeccionadaId: actual.transferenciaConfeccionadaId,
      transferenciasEnFirma: enFirma,
    }
  }
  return {
    cambio: true,
    estado: esTotal ? 'pendiente' : actual.estado,
    transferenciaConfeccionadaId: esTotal ? null : actual.transferenciaConfeccionadaId,
    transferenciasEnFirma: siguientes,
  }
}
