import type { Timestamp } from 'firebase-admin/firestore'

export type ChequeTipo = 'echeq' | 'fisico'

export type ChequeDireccion = 'recibido' | 'emitido'

export type ChequeOrigen = 'cliente' | 'tercero' | 'propio'

export type ChequeEstado =
  | 'en_cartera'
  | 'depositado'
  | 'vendido'
  | 'rechazado'
  | 'pendiente'
  | 'debitado'

export const CHEQUE_ESTADO_LABELS: Record<ChequeEstado, string> = {
  en_cartera: 'En cartera',
  depositado: 'Depositado',
  vendido: 'Vendido',
  rechazado: 'Rechazado',
  pendiente: 'Pendiente',
  debitado: 'Debitado',
}

export const CHEQUE_DIRECCION_LABELS: Record<ChequeDireccion, string> = {
  recibido: 'Recibido',
  emitido: 'Emitido',
}

export interface ChequeDocument {
  numero: string
  tipo: ChequeTipo
  direccion: ChequeDireccion
  origen: ChequeOrigen

  montoCentavos: number

  fechaEmision: string
  fechaPago: string
  fechaRecibido: string | null
  fechaEntregado: string | null

  emisor: string
  emisorCuit: string
  bancoEmisor: string | null
  cliente: string | null
  endosante: string | null
  destinatario: string | null

  estado: ChequeEstado
  utilizado: boolean | null

  cmc7: string | null
  observaciones: string | null

  /** ID del movimiento bancario vinculado (traza). */
  movimientoBancarioId?: string | null
  /** Cuenta bancaria donde impactó el movimiento. */
  movimientoCuentaId?: string | null
  /** Fecha del movimiento bancario (YYYY-MM-DD). */
  movimientoFecha?: string | null
  /** Fecha real de acreditación: del Excel en emitidos, del movimiento en recibidos. */
  fechaAcreditacion?: string | null

  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

export interface ChequeImportRow {
  numero: string
  tipo: ChequeTipo
  direccion: ChequeDireccion
  origen: ChequeOrigen

  montoCentavos: number

  fechaEmision: string
  fechaPago: string
  fechaRecibido: string | null
  fechaEntregado: string | null

  emisor: string
  emisorCuit: string
  bancoEmisor: string | null
  cliente: string | null
  endosante: string | null
  destinatario: string | null

  estado: ChequeEstado
  utilizado: boolean | null

  cmc7: string | null
  observaciones: string | null

  fechaAcreditacion: string | null
}
