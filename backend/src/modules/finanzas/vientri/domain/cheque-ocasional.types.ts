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

/**
 * Por qué la tasa de una renovación no es confiable:
 *  - faltan_viejos: el OBS nombra cheques que no aparecen → la base queda chica y la tasa se infla.
 *  - pago_parcial: los nuevos suman menos que los viejos → se pagó una parte; no es interés negativo.
 *  - capital_nuevo: más de 15 % por mes → seguramente se sumó plata prestada además del interés.
 */
export type AvisoTasaRenovacion = 'faltan_viejos' | 'pago_parcial' | 'capital_nuevo'

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
  /** Días entre el vencimiento promedio de los viejos y el de los nuevos (promedio ponderado por monto). */
  diasRenovacion: number | null
  /** Interés ÷ viejos: lo que se pagó por TODO el plazo, no por mes. */
  tasaImplicita: number
  /** `tasaImplicita` llevada a 30 días. Es la que se compara entre operaciones. */
  tasaMensualEstimada: number | null
  /** Si la cuenta nuevos − viejos no es confiable como interés, por qué. Null si está bien. */
  avisoTasa: AvisoTasaRenovacion | null
  /** Cheques que el OBS dice que se renuevan pero no están en los datos (ej. número mal tipeado). */
  viejosNoEncontrados: string[]

  vinculada: boolean
  tipoVinculo: 'explicito' | 'implicito'
  obsOriginal: string
  debugAutolink?: string
  /**
   * 'inicial' = el préstamo original (OBS "Capital", "INTERESES Y CAP"…): sus cheques van en `chequesNuevos` y no tiene
   * viejos. Falta (las guardadas antes de 11/2026) o 'renovacion' = una renovación.
   */
  tipo?: TipoOperacion
  /** Solo en operaciones iniciales: qué cheques son interés y cuáles capital, si se pudo saber. */
  desgloseInicial?: DesgloseInicial | null
}

export type TipoOperacion = 'inicial' | 'renovacion'

/**
 * Préstamo con el interés pagado mes a mes en cheques iguales y el capital aparte (ej. HERMANA CLAU 11/03/2026:
 * 3 cheques de $1.262.266 = 7 % de $18.032.366; MAHUM DIEGO 04/09/2026: 2 cheques de $550.000 por mes = 5,5 % de
 * $20.000.000). Solo se arma cuando la tasa da redonda: ver `detectarDesgloseInicial`.
 */
export interface DesgloseInicial {
  /** Por mes (0,07 = 7 %). */
  tasaMensual: number
  capitalCentavos: number
  /** Suma de todos los cheques de interés. */
  interesCentavos: number
  /** Monto de cada cheque de interés. */
  interesPorChequeCentavos: number
  /** Cheques de interés que vencen cada mes (MAHUM DIEGO 04/09/2026: 2, el 24 y el 26). */
  chequesPorMes: number
  /** Interés de un mes: monto × cheques por mes. Es el que da la tasa. */
  interesPorMesCentavos: number
  chequesInteres: string[]
  chequesCapital: string[]
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
  /** Otros pagos (retiros, pagos a personas): no es operación financiera. Se calcula al leer, no se guarda. */
  esOtroPago?: boolean
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
