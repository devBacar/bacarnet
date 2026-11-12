import type { SugerenciaInteres } from './interes-posicion.js'

export interface RenovacionParseada {
  chequeIds: string[]
}

export interface OperacionUsdParseada {
  montoUsd: number
  cotizacion: number
}

export interface TasaExplicitaParseada {
  montoPesosCentavos: number
  tasaPorcentaje: number
}

export interface ObsParseada {
  renovacion: RenovacionParseada | null
  operacionUsd: OperacionUsdParseada | null
  tasaExplicita: TasaExplicitaParseada | null
  rol: RolEnOperacion
  obsOriginal: string
}

export type RolEnOperacion = 'capital' | 'interes' | 'mixto' | null

/** Tipos de operación que Finanzas puede marcar a mano en un cheque ocasional. */
export type TipoOperacionManual = 'usd' | 'renovacion' | 'rol'

/**
 * Interés pagado aparte que Finanzas confirmó: a qué renovación corresponde y cómo se calculó. Se guarda en los
 * cheques de interés (los del mismo grupo) y no lo pisa la importación.
 */
export interface InteresDeRenovacion {
  /** Emisión de la renovación a la que corresponde ('YYYY-MM-DD'); null si no hubo renovación ese día. */
  fechaRenovacion: string | null
  obsRenovacion: string
  /** 6 = 6 %. Si `porMes`, es por mes durante `meses`. */
  tasaPorcentaje: number
  porMes: boolean
  meses: number
  baseCentavos: number
  /** Sobre qué se calculó, en palabras: "lo que vence en enero de 2027". */
  baseDescripcion: string
}

/** Los datos de una operación marcada a mano; solo viene el bloque del tipo elegido. */
export interface DatosOperacionManual {
  usd?: OperacionUsdParseada
  /** Números de los cheques viejos que este cheque renueva. */
  chequeIds?: string[]
  rol?: Exclude<RolEnOperacion, null>
  /**
   * Solo con rol "interés": a qué operación corresponde cada cheque de interés pagado aparte, por número corto de
   * cheque (cada cheque puede ir a una renovación distinta).
   */
  interesDePorCheque?: Record<string, InteresDeRenovacion>
}

export interface SugerenciaOperacion {
  tipo: TipoOperacionManual
  datos: DatosOperacionManual
  /** Cuántas veces Finanzas confirmó este mismo formato de OBS para este beneficiario. */
  confirmaciones: number
}
export type RolEnCadena = 'capital' | 'interes' | 'mixto' | null

export interface CostoEslabon {
  chequeViejo: string
  chequeNuevo: string
  montoViejoCentavos: number
  montoNuevoCentavos: number
  interesCentavos: number
  fechaEmisionViejo: string | null
  fechaVtoViejo: string | null
  fechaEmisionNuevo: string | null
  fechaVtoNuevo: string | null
  diasEntreEmisiones: number | null
}

export interface CadenaRenovacion {
  id: string
  beneficiario: string
  beneficiarioNormalizado: string
  cheques: string[]
  eslabones: CostoEslabon[]
  capitalInicialCentavos: number
  montoFinalCentavos: number
  interesTotalCentavos: number
  tasaImplicita: number
  operacionUsd: OperacionUsdParseada | null
  fechaInicio: string | null
  fechaFin: string | null
  diasTotales: number | null
}

export interface ChequeClasificado {
  numeroCheque: string
  rolEnCadena: RolEnCadena
  cadenaId: string | null
}

export interface ChequeEnOperacion {
  numeroCheque: string
  montoCentavos: number
  fechaVencimiento: string | null
  fechaEmision: string | null
  rol: 'capital' | 'interes' | 'mixto' | null
  pagado: boolean
  /** A nombre de quién salió el cheque (las operaciones guardadas antes de 11/2026 no lo tienen). */
  beneficiario?: string
  beneficiarioNormalizado?: string
}

export interface OperacionRenovacion {
  id: string
  beneficiario: string
  beneficiarioNormalizado: string
  fechaEmision: string | null
  banco: string | null

  chequesViejos: ChequeEnOperacion[]
  chequesNuevos: ChequeEnOperacion[]

  totalViejosCentavos: number
  totalNuevosCentavos: number
  interesCentavos: number

  fechaVtoViejos: string | null
  fechaVtoNuevos: string | null
  diasRenovacion: number | null
  tasaImplicita: number
  tasaMensualEstimada: number | null

  vinculada: boolean
  tipoVinculo: 'explicito' | 'implicito'
  obsOriginal: string
  debugAutolink?: string
}

export interface ChequeOcasionalDoc {
  numeroCheque: string
  beneficiario: string
  beneficiarioNormalizado: string
  beneficiarioFormal: string | null
  beneficiarioCuit: string | null
  /** El cheque vino sin destinatario y el beneficiario se tomó del comienzo del OBS (ver `beneficiario-desde-obs.ts`). */
  beneficiarioDesdeObs?: boolean
  /**
   * El cheque vino sin destinatario y el beneficiario se heredó de los cheques que renueva (todos del mismo
   * beneficiario; ver `beneficiario-desde-renovacion.ts`).
   */
  beneficiarioDesdeRenovacion?: boolean
  montoCentavos: number
  fechaVencimiento: string | null
  fechaEmision: string | null
  estadoCodigo: number | null
  estado: string
  pagado: boolean
  esProveedorFinanciero: boolean
  tipoProveedor: 'financiero' | 'ficticio' | null
  esRenovacion: boolean
  renovacionDe: string[]
  renovadoPor: string[]
  operacionUsd: OperacionUsdParseada | null
  tasaExplicita: TasaExplicitaParseada | null
  rolEnOperacion: RolEnOperacion
  obsOriginal: string
  revisar: string[]
  proveedorFinancieroId: string | null
  /** Compra de IVA: OBS con "IVA" o beneficiario CONTA I / III / IIII / IV. Se recalcula en cada sincronización. */
  esCompraIva?: boolean
  /** Tipo de operación propuesto por un patrón aprendido; Finanzas lo confirma a mano. Se recalcula en cada sincronización. */
  sugerencia?: SugerenciaOperacion | null
  /** Sobre qué cheques parece calculado un interés pagado aparte (ver `interes-posicion.ts`). Se recalcula en cada sincronización. */
  interesSugerido?: SugerenciaInteres | null
  /** Interés pagado aparte confirmado por Finanzas: a qué renovación corresponde. */
  interesDe?: InteresDeRenovacion | null
  /** Quién marcó a mano el tipo de operación (si lo hizo alguien). */
  clasificacionManual?: { tipo: TipoOperacionManual; uid: string; fecha: string } | null
  vientriId: number
  fechaConciliado: string | null
  vientriChqId: number | null
  baja: boolean
  /** Los escribe la conciliación con el banco; la importación los conserva. */
  movimientoBancarioId?: string | null
  movimientoCuentaId?: string | null
  movimientoFecha?: string | null
}
