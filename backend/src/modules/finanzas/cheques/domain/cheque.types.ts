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
  | 'renovado'

export const CHEQUE_ESTADO_LABELS: Record<ChequeEstado, string> = {
  en_cartera: 'En cartera',
  depositado: 'Depositado',
  vendido: 'Vendido',
  rechazado: 'Rechazado',
  pendiente: 'Pendiente',
  debitado: 'Debitado',
  renovado: 'Renovado',
}

export const CHEQUE_DIRECCION_LABELS: Record<ChequeDireccion, string> = {
  recibido: 'Recibido',
  emitido: 'Emitido',
}

/** Compromiso de Agenda que este cheque paga (vínculo inverso de compromiso.chequeId). */
export interface ChequePagoDe {
  compromisoId: string
  proveedorONombre: string
  concepto: string
}

/** Arma el vínculo al compromiso en el momento del pago (snapshot de nombre y concepto). */
export function armarChequePagoDe(input: {
  compromisoId: string
  proveedorONombre: string | null | undefined
  concepto: string | null | undefined
}): ChequePagoDe {
  return {
    compromisoId: input.compromisoId.trim(),
    proveedorONombre: (input.proveedorONombre ?? '').trim(),
    concepto: (input.concepto ?? '').trim(),
  }
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
  bancoEmisorCodigo: number | null
  cliente: string | null
  endosante: string | null
  destinatario: string | null

  estado: ChequeEstado
  estadoBancario: string | null
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

  /**
   * Compromiso que este cheque paga (emitido propio o endoso de cartera desde Hoy).
   * Ausente/null en cheques viejos o sin vínculo a Agenda.
   */
  pagoDe?: ChequePagoDe | null

  /** true si este cheque fue creado o actualizado desde vientriCheques. */
  vientriSync?: boolean
  /** Última vez que se sincronizó desde Vientri. */
  vientriSyncAt?: Timestamp | null
  /** Clave del doc en vientriCheques (ej. chq-123, oca-456). */
  vientriClave?: string | null
  /** ID del comprobante de ingreso en Vientri. */
  vientriCmpIngreso?: number | null
  /** Tipo y número legible del comprobante de ingreso en Vientri (ej: 'OPA 852334'). */
  vientriCmpIngresoDesc?: string | null
  /** ID del comprobante de salida en Vientri. */
  vientriCmpSalida?: number | null
  /** Tipo y número legible del comprobante de salida en Vientri (ej: 'RCX 838069'). */
  vientriCmpSalidaDesc?: string | null
  /** Nota de débito por rechazo en Vientri. */
  vientriCmpNdRechazo?: number | null
  /** Comprobante del pago del banco en Vientri. */
  vientriCmpPagoBanco?: number | null
  /** Estado anterior en Vientri (label legible). */
  vientriEstadoPrevio?: string | null
  /** ID del motivo de rechazo en Vientri. */
  vientriMotivoRechazoId?: number | null

  /**
   * Un cheque no se "paga": se renueva (se reemplaza por uno nuevo de mayor monto). Mientras está
   * pendiente de renovar, no hay que pagarlo hoy pero tampoco está resuelto: queda en la cola de
   * "Pendientes de renovar" (Cheques > Ocasionales > Renovaciones) hasta que alguien cargue el
   * cheque nuevo que lo reemplaza.
   */
  pendienteRenovacion?: boolean
  pendienteRenovacionDesde?: Timestamp | null
  pendienteRenovacionPorUid?: string | null
  /**
   * Se confirmó la renovación a mano en Bacarnet (no por el cruce automático con las observaciones
   * de Vientri). El sync diario de Vientri NUNCA toca este campo: así, si Vientri todavía no vio la
   * renovación, el próximo sync no puede "deshacerla" pisando el estado de vuelta a pendiente.
   */
  renovadoManualmente?: boolean
  /** Números de cheque que este cheque reemplazó al renovarse (puede ser más de uno). */
  renovacionDe?: string[] | null
  /** Números de cheque que reemplazaron a este cheque al renovarse. */
  renovadoPor?: string[] | null

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
  bancoEmisorCodigo: number | null
  cliente: string | null
  endosante: string | null
  destinatario: string | null

  estado: ChequeEstado
  estadoBancario: string | null
  utilizado: boolean | null

  cmc7: string | null
  observaciones: string | null

  fechaAcreditacion: string | null
}

export type ChequeHistorialOrigen = 'reconciliacion' | 'manual' | 'importacion' | 'vientri'

export interface ChequeHistorialEstadoDocument {
  estadoAnterior: ChequeEstado | null
  estadoNuevo: ChequeEstado
  origen: ChequeHistorialOrigen
  usuario: string | null
  nota: string | null
  fecha: Timestamp
}

