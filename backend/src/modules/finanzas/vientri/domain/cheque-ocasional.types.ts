export interface RenovacionParseada {
  chequeIds: string[]
}

export interface OperacionUsdParseada {
  montoUsd: number
  cotizacion: number
}

export interface ObsParseada {
  renovacion: RenovacionParseada | null
  operacionUsd: OperacionUsdParseada | null
  obsOriginal: string
}

export type ClasificacionCheque = 'gasto_real' | 'operacion_financiera'

export type RolEnCadena = 'capital' | 'interes' | 'mixto' | null

export interface CostoEslabon {
  chequeViejo: string
  chequeNuevo: string
  montoViejoCentavos: number
  montoNuevoCentavos: number
  interesCentavos: number
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
}

export interface ChequeClasificado {
  numeroCheque: string
  clasificacion: ClasificacionCheque
  rolEnCadena: RolEnCadena
  cadenaId: string | null
}

export interface ChequeOcasionalDoc {
  numeroCheque: string
  beneficiario: string
  beneficiarioNormalizado: string
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
  obsOriginal: string
  revisar: string[]
  vientriId: number
  baja: boolean
}
