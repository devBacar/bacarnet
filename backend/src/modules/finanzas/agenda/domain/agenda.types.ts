import type { Timestamp } from 'firebase-admin/firestore'
import type { PrioridadUrgencia } from './agenda.prioridad.js'

export type MedioPago = 'transferencia' | 'cheque' | 'efectivo'

export type CompromisoEstado = 'pendiente' | 'pagado' | 'vencido'

export type CobroEstado = 'esperado' | 'confirmado' | 'incobrable'

export interface CompromisoPagoDocument {
  concepto: string
  proveedorONombre: string
  montoCentavos: number
  fechaVencimiento: Timestamp
  /** @deprecated Solo lectura legacy; usar urgenciaManual. */
  prioridad: number
  urgenciaManual: PrioridadUrgencia | null
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
  /** @deprecated Solo lectura legacy; usar urgenciaManual. */
  prioridad: number
  urgenciaManual: PrioridadUrgencia | null
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
