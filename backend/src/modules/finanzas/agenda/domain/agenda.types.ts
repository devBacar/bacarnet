import type { Timestamp } from 'firebase-admin/firestore'

export type MedioPago = 'transferencia' | 'cheque' | 'efectivo'

export type CompromisoEstado = 'pendiente' | 'pagado' | 'vencido'

export type CobroEstado = 'esperado' | 'confirmado' | 'incobrable'

export interface CompromisoPagoDocument {
  concepto: string
  proveedorONombre: string
  montoCentavos: number
  fechaVencimiento: Timestamp
  prioridad: number
  medioPago: MedioPago
  chequeId: string | null
  estado: CompromisoEstado
  cuentaId: string | null
  fechaPago: Timestamp | null
  pagadoPor: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

export interface CobroEsperadoDocument {
  clienteONombre: string
  montoCentavos: number
  fechaEsperada: Timestamp
  prioridad: number
  chequeId: string | null
  estado: CobroEstado
  cuentaId: string | null
  fechaConfirmado: Timestamp | null
  confirmadoPor: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

export interface HistorialEstadoDocument {
  estadoAnterior: string | null
  estadoNuevo: string
  fecha: Timestamp
  usuario: string
  nota: string | null
}

export type VencimientoAlerta = 'vencido' | 'proximo' | 'neutro'
