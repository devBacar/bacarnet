import type { Timestamp } from 'firebase-admin/firestore'

export type CajaTipo = 'principal' | 'chica'
export type CajaMoneda = 'ARS' | 'USD'
export type CajaEstado = 'activa' | 'inactiva'

export type CajaMovimientoTipo =
  | 'ingreso'
  | 'egreso'
  | 'fondeo_recibido'
  | 'fondeo_enviado'

export type CajaCierreEstado = 'borrador' | 'cerrada' | 'aprobada'

export interface CajaDocument {
  nombre: string
  tipo: CajaTipo
  moneda: CajaMoneda
  cajaPadreId: string | null
  responsableUid: string
  saldoActualCentavos: number
  /** Ausente en docs viejos → tratar como 'activa'. */
  estado?: CajaEstado
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

export interface HistorialCustodiaDocument {
  responsableAnteriorUid: string | null
  responsableNuevoUid: string
  fecha: Timestamp
  motivo: string | null
  registradoPor: string
}

/** Asiento inmutable: no se edita ni se borra. Retención mínima 2 años. */
export interface CajaMovimientoDocument {
  cajaId: string
  tipo: CajaMovimientoTipo
  concepto: string
  montoCentavos: number
  fecha: Timestamp
  /** Path en Storage; la API expone URL firmada. */
  comprobanteStoragePath: string | null
  categoria: string | null
  esViatico: boolean
  beneficiarioEmpleado: string | null
  fondeoVinculadoId: string | null
  operacionVinculadaId: string | null
  /** Cotización ARS por USD expresada en centavos; solo para Compra USD. */
  cotizacionCentavosPorUsd: number | null
  registradoPor: string
  createdAt: Timestamp
}

export interface CajaCierreDocument {
  cajaId: string
  periodoDesde: Timestamp
  periodoHasta: Timestamp
  saldoInicial: number
  totalFondeosRecibidos: number
  totalEgresos: number
  totalEgresosConComprobante: number
  totalEgresosSinComprobante: number
  totalIngresos: number
  saldoTeorico: number
  efectivoContado: number | null
  diferencia: number | null
  estado: CajaCierreEstado
  aprobadaPorUid: string | null
  createdAt: Timestamp
  createdBy: string
}
