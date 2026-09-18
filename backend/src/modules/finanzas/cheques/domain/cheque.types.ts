import type { Timestamp } from 'firebase-admin/firestore'

export type ChequeDireccion = 'recibido' | 'emitido'

export type ChequeTipo = 'fisico' | 'echeq'

/** Estados del flujo de cheques que la empresa recibe de terceros. */
export type ChequeEstadoRecibido =
  | 'en_cartera'
  | 'depositado'
  | 'endosado'
  | 'vendido'
  | 'acreditado'
  | 'rechazado'

/** Estados del flujo de cheques emitidos con chequera propia. */
export type ChequeEstadoEmitido = 'emitido' | 'entregado' | 'debitado' | 'anulado' | 'rechazado'

export type ChequeEstado = ChequeEstadoRecibido | ChequeEstadoEmitido

export type ChequeActionRecibido = 'depositar' | 'endosar' | 'vender' | 'rechazar'
export type ChequeActionEmitido = 'entregar' | 'debitar' | 'rechazar' | 'anular'

export interface ChequeDocument {
  direccion: ChequeDireccion
  numero: string
  /** Banco del cheque: emisor externo (recibido) o banco de la cuenta CC (emitido). */
  bancoEmisor: string
  libradorNombre: string | null
  libradorCuit: string | null
  beneficiarioNombre: string | null
  beneficiarioCuit: string | null
  cuentaId: string | null
  montoCentavos: number
  fechaEmision: Timestamp
  fechaPago: Timestamp
  tipo: ChequeTipo
  estadoActual: ChequeEstado
  compromisoPagoId: string | null
  cobroOrigenId: string | null
  endosadoA: string | null
  vendidoA: string | null
  vendidoConResponsabilidad: boolean | null
  motivoRechazo: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

export interface HistorialEstadoDocument {
  estadoAnterior: ChequeEstado | null
  estadoNuevo: ChequeEstado
  fecha: Timestamp
  usuario: string
  nota: string | null
}

export const CHEQUE_ESTADO_LABEL: Record<ChequeEstado, string> = {
  en_cartera: 'En cartera',
  depositado: 'Depositado',
  endosado: 'Endosado',
  vendido: 'Vendido',
  acreditado: 'Acreditado',
  emitido: 'Emitido',
  entregado: 'Entregado',
  debitado: 'Debitado',
  anulado: 'Anulado',
  rechazado: 'Rechazado',
}

export function normalizeChequeDireccion(value: unknown): ChequeDireccion {
  return value === 'emitido' ? 'emitido' : 'recibido'
}

export function isEstadoRecibido(estado: ChequeEstado): estado is ChequeEstadoRecibido {
  return (
    estado === 'en_cartera' ||
    estado === 'depositado' ||
    estado === 'endosado' ||
    estado === 'vendido' ||
    estado === 'acreditado' ||
    (estado === 'rechazado' && true)
  )
}

export function isEstadoEmitido(estado: ChequeEstado): estado is ChequeEstadoEmitido {
  return estado === 'emitido' || estado === 'entregado' || estado === 'debitado' || estado === 'anulado'
}

/** Rechazo en emitido comparte código con recibido; distinguir por `direccion` del documento. */
export function estadoPerteneceADireccion(direccion: ChequeDireccion, estado: ChequeEstado): boolean {
  if (estado === 'rechazado') return true
  if (direccion === 'recibido') {
    return (
      estado === 'en_cartera' ||
      estado === 'depositado' ||
      estado === 'endosado' ||
      estado === 'vendido' ||
      estado === 'acreditado'
    )
  }
  return estado === 'emitido' || estado === 'entregado' || estado === 'debitado' || estado === 'anulado'
}
