import type { Timestamp } from 'firebase-admin/firestore'

export type TransferenciaTipo =
  | 'cuentas_propias'
  | 'sueldos'
  | 'proveedores'
  | 'terceros'
  | 'pagos_arca'

export type TransferenciaEstado =
  | 'confeccionada'
  | 'pendiente_proceso'
  | 'rechazada'
  | 'efectivizada'
  | 'cancelada'

export type TransferenciaHistorialOrigen = 'api' | 'sync_automatico' | 'usuario'

/** Ausente en confecciones viejas por compromiso. */
export type TransferenciaOrigen = 'compromiso' | 'directa'

export interface TransferenciaConfeccionadaDocument {
  compromisoPagoId: string | null
  origen?: TransferenciaOrigen
  tipo: TransferenciaTipo
  cuentaDebitoId: string
  cuentaCreditoCbu: string
  destinoNombre?: string | null
  destinoCuit?: string | null
  referencia?: string | null
  idempotencyKey?: string | null
  montoCentavos: number
  concepto: string | null
  /** Código de motivo del banco (VAR, ALQ, …). Solo pago a terceros. */
  codigoConcepto?: string | null
  disclaimerAceptado: boolean | null
  /** confection_id enviado a Interbanking, si la confección real llegó a armarlo. */
  confectionId?: string | null
  /** Estado crudo de GET /transfers/details. */
  estadoInterbanking?: string | null
  estadoInterbankingActualizadoAt?: Timestamp | null
  /** Día de solicitud informado por el banco (AAAA-MM-DD), para la regla de las 19 hs. */
  fechaSolicitudInterbanking?: string | null
  operationId: string
  processId: string | null
  estado: TransferenciaEstado
  erroresInterbanking: string[] | null
  confeccionadaPor: string
  fechaConfeccion: Timestamp
  fechaDeteccionEfectivizada: Timestamp | null
  /**
   * Débito de movimientosBancarios que se tomó como esta transferencia.
   * El id se pierde si un sync posterior reemplaza ese día: la reconciliación
   * lo reasigna cuando queda un único débito equivalente.
   */
  movimientoId?: string | null
  /** Más de un débito coincide. No se efectiviza hasta que alguien elija. */
  requiereConfirmacionManual?: boolean
  movimientoCandidatosIds?: string[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface TransferenciaHistorialDocument {
  estadoAnterior: string | null
  estadoNuevo: string
  fecha: Timestamp
  origen: TransferenciaHistorialOrigen
  nota: string | null
}
