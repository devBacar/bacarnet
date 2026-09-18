import type {
  ChequeActionEmitido,
  ChequeActionRecibido,
  ChequeDireccion,
  ChequeEstado,
} from './cheque.types.js'
import { estadoPerteneceADireccion } from './cheque.types.js'

export class ChequeTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChequeTransitionError'
  }
}

const RECIBIDO_ACTION: Record<ChequeActionRecibido, { from: ChequeEstado[]; to: ChequeEstado }> = {
  depositar: { from: ['en_cartera'], to: 'depositado' },
  endosar: { from: ['en_cartera'], to: 'endosado' },
  vender: { from: ['en_cartera'], to: 'vendido' },
  rechazar: { from: ['depositado', 'endosado', 'vendido'], to: 'rechazado' },
}

const EMITIDO_ACTION: Record<ChequeActionEmitido, { from: ChequeEstado[]; to: ChequeEstado }> = {
  entregar: { from: ['emitido'], to: 'entregado' },
  debitar: { from: ['entregado'], to: 'debitado' },
  rechazar: { from: ['entregado'], to: 'rechazado' },
  anular: { from: ['emitido'], to: 'anulado' },
}

export function resolveEstadoAfterActionRecibido(
  action: ChequeActionRecibido,
  estadoActual: ChequeEstado,
): ChequeEstado {
  const rule = RECIBIDO_ACTION[action]
  if (!rule.from.includes(estadoActual)) {
    throw new ChequeTransitionError(
      `No se puede ${action} un cheque recibido en estado "${estadoActual}"`,
    )
  }
  return rule.to
}

export function resolveEstadoAfterActionEmitido(
  action: ChequeActionEmitido,
  estadoActual: ChequeEstado,
): ChequeEstado {
  const rule = EMITIDO_ACTION[action]
  if (!rule.from.includes(estadoActual)) {
    throw new ChequeTransitionError(
      `No se puede ${action} un cheque emitido en estado "${estadoActual}"`,
    )
  }
  return rule.to
}

export function resolveEstadoAfterAction(
  direccion: ChequeDireccion,
  action: ChequeActionRecibido | ChequeActionEmitido,
  estadoActual: ChequeEstado,
): ChequeEstado {
  if (!estadoPerteneceADireccion(direccion, estadoActual)) {
    throw new ChequeTransitionError(
      `Estado "${estadoActual}" no corresponde a un cheque ${direccion}`,
    )
  }
  if (direccion === 'emitido') {
    return resolveEstadoAfterActionEmitido(action as ChequeActionEmitido, estadoActual)
  }
  if (action === 'entregar' || action === 'debitar' || action === 'anular') {
    throw new ChequeTransitionError(`La acción ${action} no aplica a cheques recibidos`)
  }
  return resolveEstadoAfterActionRecibido(action as ChequeActionRecibido, estadoActual)
}

/** @deprecated Usar resolveEstadoAfterActionRecibido — compat tests legacy. */
export function resolveEstadoAfterActionLegacy(
  action: ChequeActionRecibido,
  estadoActual: ChequeEstado,
): ChequeEstado {
  return resolveEstadoAfterActionRecibido(action, estadoActual)
}

export interface HistorialEstadoInput {
  estadoAnterior: ChequeEstado | null
  estadoNuevo: ChequeEstado
  usuario: string
  nota: string | null
}

export function buildHistorialEstadoEntry(input: HistorialEstadoInput): HistorialEstadoInput {
  if (!input.usuario.trim()) {
    throw new Error('historialEstados: usuario requerido')
  }
  if (!input.estadoNuevo) {
    throw new Error('historialEstados: estadoNuevo requerido')
  }
  return {
    estadoAnterior: input.estadoAnterior,
    estadoNuevo: input.estadoNuevo,
    usuario: input.usuario.trim(),
    nota: input.nota?.trim() ? input.nota.trim() : null,
  }
}
