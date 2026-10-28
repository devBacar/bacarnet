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
  renovacionDe: string[]
  renovadoPor: string[]
  operacionUsd: OperacionUsdParseada | null
  obsOriginal: string
  revisar: string[]
  vientriId: number
  baja: boolean
}
