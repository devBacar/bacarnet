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

export type TransferenciaHistorialOrigen = 'api' | 'sync_automatico' | 'usuario'

export interface TransferenciaConfeccionadaDocument {
  compromisoPagoId: string
  tipo: TransferenciaTipo
  cuentaDebitoId: string
  cuentaCreditoCbu: string
  montoCentavos: number
  concepto: string | null
  disclaimerAceptado: boolean | null
  operationId: string
  processId: string | null
  estado: TransferenciaEstado
  erroresInterbanking: string[] | null
  confeccionadaPor: string
  fechaConfeccion: Timestamp
  fechaDeteccionEfectivizada: Timestamp | null
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
