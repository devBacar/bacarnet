import type { ChequeEnOperacion, OperacionRenovacion } from './cheque-ocasional.types.js'

/**
 * Estado de un cheque NUEVO dentro de una operación de renovación.
 * - pendiente / rechazado: cuentan en la exposición (rechazado = la plata no entró).
 * - debitado / anulado / renovado: salen de la exposición.
 * Los cheques con `baja` no aparecen (se excluyen antes de agrupar).
 */
export type EstadoChequeRenov = 'pendiente' | 'debitado' | 'renovado' | 'rechazado' | 'anulado'

export interface ChequeConEstado extends ChequeEnOperacion {
  estado: EstadoChequeRenov
  /** Id de la operación en la que este cheque figura como viejo (si fue renovado). */
  operacionSiguienteId: string | null
}

/**
 * Operación lista para persistir. El estado abierta/cerrada NO se guarda porque depende de la
 * fecha de hoy: se calcula al leer con `estadoOperacion(op, hoy)`.
 */
export interface OperacionPersistida extends Omit<OperacionRenovacion, 'chequesNuevos'> {
  chequesNuevos: ChequeConEstado[]
  /** Operaciones cuyos cheques nuevos aparecen como viejos en esta (cadena hacia atrás). */
  operacionesAnterioresIds: string[]
  /** Máximo fechaVencimiento entre los cheques nuevos. */
  fechaVtoMax: string | null
  /** Suma de los nuevos en estado pendiente + rechazado. */
  exposicionCentavos: number
}

export type EstadoOperacion = 'abierta' | 'cerrada'

export type FiltroSeguimiento = 'abiertas' | 'todas'

export interface OperacionSeguimientoItem extends OperacionPersistida {
  estadoOperacion: EstadoOperacion
  /** Ancestros transitivos (ids), del más cercano al más lejano. */
  ancestrosIds: string[]
}

export interface BeneficiarioSeguimiento {
  /** Nombre del proveedor en el catálogo, o como está escrito si no está cargado. */
  beneficiario: string
  beneficiarioNormalizado: string
  proveedorId: string | null
  /** Cheques nuevos en estado pendiente + rechazado. */
  posicionesAbiertas: number
  rechazadas: number
  exposicionCentavos: number
  operaciones: OperacionSeguimientoItem[]
}

export interface SeguimientoResponse {
  hoy: string
  estado: FiltroSeguimiento
  beneficiarios: BeneficiarioSeguimiento[]
  /** Operaciones referenciadas en `ancestrosIds` que no están en `beneficiarios`: permiten navegar hacia atrás. */
  ancestros: OperacionSeguimientoItem[]
  totales: {
    beneficiarios: number
    operaciones: number
    posicionesAbiertas: number
    exposicionCentavos: number
    /** Cheques pendientes/rechazados cuyo vencimiento ya pasó. */
    vencidosCantidad: number
    vencidosCentavos: number
    /** Cheques pendientes/rechazados que vencen dentro de 7 / 15 / 30 días (acumulativos). */
    porVencer7d: number
    porVencer15d: number
    porVencer30d: number
    /** Eslabones de la cadena más larga (0 = sin cadena). */
    profundidadMaxCadena: number
    /** Última operación de la cadena más larga (null si profundidad = 0). */
    cadenaMasLargaOp: { id: string; beneficiario: string } | null
    /** % de exposición del beneficiario con más exposición (0–100). */
    concentracionTopPct: number
  }
}