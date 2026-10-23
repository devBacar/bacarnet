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

/** Datos que vienen de Vientri (solo en compromisos/cobros con origen 'vientri'). No se editan en Bacarnet. */
export interface VientriEnAgenda {
  clave: string
  comprobante: string
  tipo: string | null
  cuit: string | null
  totalCentavos: number
  fechaVencimiento: string
  fechaDatos: string
  /** En Vientri no tiene vencimiento (es la fecha de la factura): Finanzas tiene que ponerle el día. */
  sinFechaDePago?: boolean
  /** La fecha no viene de Vientri: se estimó según lo que tarda esta persona en pagar o cobrar. */
  fechaEstimada?: boolean
  plazoDias?: number | null
  plazoOrigen?: 'historia' | 'general' | null
}

/** De dónde salió el compromiso o el cobro. Sin el campo: cargado a mano en Bacarnet. */
export type OrigenAgenda = 'vientri' | 'inversiones' | 'planilla'

/** Cuota de una inversión (solo con origen 'inversiones'). Monto, fecha y moneda se cambian desde Inversiones. */
export interface InversionEnAgenda {
  inversionId: string
  numero: string
  cuotaNumero: number | null
  /** Para no reescribir el compromiso si el cronograma no cambió (respeta lo que se reprogramó en la Agenda). */
  versionCronograma: number
}

/** Fila importada de la planilla de compromisos de Finanzas (solo con origen 'planilla'). */
export interface PlanillaEnAgenda {
  /** 'YYYY-MM' de la hoja. */
  mes: string
  hoja: string
  fila: number
  /** Clave estable de la fila (grupo + concepto) para reimportar sin duplicar. */
  clave: string
  importadoAt: string
  importadoPor: string
}

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
  /** 'vientri' si lo creó la importación diaria de Vientri; los cargados a mano no lo tienen. */
  origen?: OrigenAgenda
  vientri?: VientriEnAgenda
  inversion?: InversionEnAgenda
  planilla?: PlanillaEnAgenda
  /**
   * Anulado: ya no corresponde (ej. cuota de una inversión devuelta antes). No se borra (baja lógica, REGLAS 5.1);
   * listAllCompromisos no lo devuelve, así que no aparece en la Agenda, Hoy ni el tablero.
   */
  anulado?: boolean
  anuladoAt?: Timestamp | null
  anuladoMotivo?: string | null
  /** Si al crearlo había uno cargado a mano con el mismo importe y fecha cercana. */
  posibleDuplicado?: { id: string; descripcion: string } | null
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
  moneda?: 'ARS' | 'USD'
  origen?: OrigenAgenda
  vientri?: VientriEnAgenda
  inversion?: { inversionId: string; numero: string } | null
  /** Concepto libre (lo usan los cobros de Inversiones y los de Hoy). */
  concepto?: string | null
  anulado?: boolean
  /** Si al crearlo había uno cargado a mano con el mismo importe y fecha cercana. */
  posibleDuplicado?: { id: string; descripcion: string } | null
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
