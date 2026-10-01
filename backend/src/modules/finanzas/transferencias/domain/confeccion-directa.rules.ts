import { validarCbu, validarCuitOpcional } from './cbu-cuit.js'
import { conceptoTercerosPorCodigo, CONCEPTO_TERCEROS_DEFAULT } from './conceptos-transferencia.js'

/**
 * Interbanking: las observaciones soportan como máximo 60 caracteres
 * (tef.gestion.error.idinternomuylargo). El concepto libre de la confección
 * directa usa ese tope. La referencia opcional tiene el mismo límite.
 */
export const MAX_OBSERVACION_INTERBANKING = 60

export const MENSAJE_TRANSFERENCIAS_REALES_DESHABILITADAS =
  'Las transferencias reales están deshabilitadas en este entorno'

export type TransferenciaDirectaTipo = 'cuentas_propias' | 'terceros' | 'proveedores'

export type TipoCuentaDestino = 'CC' | 'CA'

export interface ConfeccionDirectaParseada {
  cuentaDebitoId: string
  tipo: TransferenciaDirectaTipo
  destinoCuentaId: string | null
  destinoCbu: string | null
  destinoNombre: string | null
  destinoCuit: string | null
  destinoTipoCuenta: TipoCuentaDestino | null
  montoCentavos: number
  concepto: string
  codigoConcepto: string | null
  disclaimerAceptado: boolean | null
  referencia: string | null
  idempotencyKey: string
  confirmarSinFondos: boolean
  /** Si viene, la transferencia queda atada a ese pago de la agenda. */
  compromisoPagoId: string | null
}

export class TransferenciaHttpError extends Error {
  readonly status: number
  readonly payload: {
    error: string
    requiereConfirmacion?: boolean
    disponibleCentavos?: number
  }

  constructor(
    status: number,
    payload: {
      error: string
      requiereConfirmacion?: boolean
      disponibleCentavos?: number
    },
  ) {
    super(payload.error)
    this.name = 'TransferenciaHttpError'
    this.status = status
    this.payload = payload
  }
}

const TIPOS: TransferenciaDirectaTipo[] = ['cuentas_propias', 'terceros', 'proveedores']

function texto(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function objeto(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function esErrorCandadoTransferencias(err: unknown): boolean {
  return err instanceof Error && err.message.includes('INTERBANKING_TRANSFER_ALLOW_REAL')
}

export function disponibleCuentaCentavos(
  saldoActualCentavos: number,
  descubiertoCentavos: number | null | undefined,
): number {
  const saldo = Number.isFinite(saldoActualCentavos) ? saldoActualCentavos : 0
  const descubierto =
    descubiertoCentavos == null || !Number.isFinite(descubiertoCentavos) ? 0 : descubiertoCentavos
  return saldo + descubierto
}

export function parseConfeccionDirectaBody(body: Record<string, unknown>): ConfeccionDirectaParseada {
  const cuentaDebitoId = texto(body.cuentaDebitoId)
  if (!cuentaDebitoId) {
    throw new TransferenciaHttpError(400, { error: 'Elegí la cuenta de débito' })
  }

  const tipo = texto(body.tipo)
  if (!TIPOS.includes(tipo as TransferenciaDirectaTipo)) {
    throw new TransferenciaHttpError(400, {
      error: 'El tipo tiene que ser cuentas propias, terceros o proveedores',
    })
  }

  const destino = objeto(body.destino)
  if (!destino) {
    throw new TransferenciaHttpError(400, { error: 'Falta el destino de la transferencia' })
  }

  const monto = body.montoCentavos
  if (typeof monto !== 'number' || !Number.isInteger(monto) || monto <= 0) {
    throw new TransferenciaHttpError(400, {
      error: 'El monto tiene que ser un entero de centavos mayor a cero',
    })
  }

  const concepto = texto(body.concepto)
  if (!concepto) {
    throw new TransferenciaHttpError(400, { error: 'El concepto es obligatorio' })
  }
  if (concepto.length > MAX_OBSERVACION_INTERBANKING) {
    throw new TransferenciaHttpError(400, {
      error: `El concepto no puede pasar de ${MAX_OBSERVACION_INTERBANKING} caracteres`,
    })
  }

  const referenciaRaw = texto(body.referencia)
  if (referenciaRaw.length > MAX_OBSERVACION_INTERBANKING) {
    throw new TransferenciaHttpError(400, {
      error: `La referencia no puede pasar de ${MAX_OBSERVACION_INTERBANKING} caracteres`,
    })
  }

  const idempotencyKey = texto(body.idempotencyKey)
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey)) {
    throw new TransferenciaHttpError(400, { error: 'Falta una clave de idempotencia válida' })
  }

  if (body.disclaimerAceptado != null && typeof body.disclaimerAceptado !== 'boolean') {
    throw new TransferenciaHttpError(400, { error: 'La aceptación del aviso tiene que ser sí o no' })
  }

  if (body.confirmarSinFondos != null && typeof body.confirmarSinFondos !== 'boolean') {
    throw new TransferenciaHttpError(400, { error: 'confirmarSinFondos tiene que ser sí o no' })
  }

  const tipoDirecto = tipo as TransferenciaDirectaTipo
  let destinoCuentaId: string | null = null
  let destinoCbu: string | null = null
  let destinoNombre: string | null = null
  let destinoCuit: string | null = null
  let destinoTipoCuenta: TipoCuentaDestino | null = null

  if (tipoDirecto === 'cuentas_propias') {
    destinoCuentaId = texto(destino.cuentaId)
    if (!destinoCuentaId) {
      throw new TransferenciaHttpError(400, { error: 'Elegí la cuenta de destino' })
    }
    if (destinoCuentaId === cuentaDebitoId) {
      throw new TransferenciaHttpError(400, {
        error: 'La cuenta de destino no puede ser la misma que la de débito',
      })
    }
  } else {
    const cbu = validarCbu(texto(destino.cbu))
    if (!cbu.ok) throw new TransferenciaHttpError(400, { error: cbu.error })
    destinoCbu = cbu.valor
    destinoNombre = texto(destino.nombre)
    if (!destinoNombre) {
      throw new TransferenciaHttpError(400, { error: 'El nombre del destinatario es obligatorio' })
    }
    if (destinoNombre.length > 120) {
      throw new TransferenciaHttpError(400, { error: 'El nombre del destinatario es demasiado largo' })
    }
    const cuit = validarCuitOpcional(texto(destino.cuit))
    if (!cuit.ok) throw new TransferenciaHttpError(400, { error: cuit.error })
    destinoCuit = cuit.valor || null
    const tipoCuentaRaw = typeof destino.tipoCuenta === 'string' ? destino.tipoCuenta.trim().toUpperCase() : ''
    if (tipoCuentaRaw !== 'CC' && tipoCuentaRaw !== 'CA') {
      throw new TransferenciaHttpError(400, {
        error: 'Elegí si la cuenta del destinatario es cuenta corriente o caja de ahorro',
      })
    }
    destinoTipoCuenta = tipoCuentaRaw
  }

  let codigoConcepto: string | null = null
  let disclaimerAceptado: boolean | null = null
  if (tipoDirecto === 'terceros') {
    const codigo = texto(body.codigoConcepto).toUpperCase() || CONCEPTO_TERCEROS_DEFAULT
    const motivo = conceptoTercerosPorCodigo(codigo)
    if (!motivo) {
      throw new TransferenciaHttpError(400, { error: 'Elegí un motivo de la lista' })
    }
    if (motivo.requiereDisclaimer && body.disclaimerAceptado !== true) {
      throw new TransferenciaHttpError(400, { error: 'Tenés que aceptar el aviso para este motivo' })
    }
    codigoConcepto = motivo.codigo
    disclaimerAceptado = body.disclaimerAceptado === true
  }

  return {
    cuentaDebitoId,
    tipo: tipoDirecto,
    destinoCuentaId,
    destinoCbu,
    destinoNombre,
    destinoCuit,
    destinoTipoCuenta,
    montoCentavos: monto,
    concepto,
    codigoConcepto,
    disclaimerAceptado,
    referencia: referenciaRaw || null,
    idempotencyKey,
    confirmarSinFondos: body.confirmarSinFondos === true,
    compromisoPagoId: texto(body.compromisoPagoId) || null,
  }
}
