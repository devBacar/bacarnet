import type { Timestamp } from 'firebase-admin/firestore'
import type { PrioridadUrgencia } from './agenda.prioridad.js'

export type MedioPago = 'transferencia' | 'cheque' | 'efectivo'

export type MonedaCompromiso = 'ARS' | 'USD'

export interface PagoCompromisoRegistrado {
  fecha: string
  montoCentavos: number
  medio: MedioPago
  referenciaId: string | null
  registradoPor: string
  registradoAt: Timestamp
  /** Opcionales: los pagos viejos no los tienen. */
  chequeId?: string | null
  cajaId?: string | null
  cuentaId?: string | null
  transferenciaId?: string | null
  movimientoId?: string | null
  claseCheque?: 'cartera' | 'propio' | null
  marcadoAMano?: boolean
}

export type CompromisoEstado =
  | 'pendiente'
  | 'vencido'
  | 'confeccionada_pendiente_autorizacion'
  | 'pagado'

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
  transferenciaConfeccionadaId: string | null
  estado: CompromisoEstado
  cuentaId: string | null
  fechaPago: Timestamp | null
  pagadoPor: string | null
  esViatico: boolean
  beneficiarioEmpleado: string | null
  /** Docs viejos sin el campo: Otros egresos. */
  grupo?: string
  /** Docs viejos sin el campo: pesos. */
  moneda?: MonedaCompromiso
  deudaTotalCentavos?: number | null
  cuotaNumero?: number | null
  cuotaTotal?: number | null
  observacion?: string | null
  /** Docs viejos sin el campo: []. Un pagado sin pagos cuenta como pago completo. */
  pagos?: PagoCompromisoRegistrado[]
  /**
   * Transferencias parciales esperando firma.
   * Ese monto ya no se puede pagar por otro lado hasta que se hagan o se rechacen.
   */
  transferenciasEnFirma?: Array<{ transferenciaId: string; montoCentavos: number }>
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
