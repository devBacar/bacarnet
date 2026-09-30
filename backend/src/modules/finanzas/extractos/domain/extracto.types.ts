import type { BancoNombre } from '../../domain/cuenta.types.js'

export type TipoMovimientoExtracto = 'debito' | 'credito'

/** Un movimiento del extracto, ya en centavos y con los campos de la huella. */
export interface MovimientoExtracto {
  fechaProceso: string
  tipo: TipoMovimientoExtracto
  montoCentavos: number
  descripcion: string
  codeDescriptionIb: string | null
  customerCuit: string | null
  operationCodeBank: string
  operationCodeIb: string
  voucherNumber: number | null
  correlativeNumber: number | null
  depositorDescription: string | null
}

/** Un día del extracto oficial: saldos, totales del banco y sus movimientos. */
export interface DiaExtracto {
  fecha: string
  saldoAperturaCentavos: number
  saldoCierreCentavos: number
  debitosCentavos: number
  creditosCentavos: number
  movimientos: MovimientoExtracto[]
}

export interface ExtractoBanco {
  cuentaId: string
  bancoNombre: BancoNombre
  bancoNumero: string
  numeroCuenta: string
  desde: string
  hasta: string
  dias: DiaExtracto[]
}

/** Fila de BacarNet o del extracto, lista para emparejar. */
export interface MovimientoControlable {
  fechaProceso: string
  tipo: TipoMovimientoExtracto
  montoCentavos: number
  descripcion: string
  codeDescriptionIb: string | null
  customerCuit: string | null
  operationCodeBank: string
  operationCodeIb: string
  voucherNumber: number | null
  correlativeNumber: number | null
  depositorDescription: string | null
  categoriaId?: string | null
}

export interface FilaSaldo extends MovimientoControlable {
  debitoCentavos: number
  creditoCentavos: number
  saldoCentavos: number
}

export interface ItemControl {
  fecha: string
  concepto: string
  tipo: TipoMovimientoExtracto
  montoCentavos: number
}

export interface ControlDia {
  fecha: string
  debitosExtractoCentavos: number
  creditosExtractoCentavos: number
  debitosBacarnetCentavos: number
  creditosBacarnetCentavos: number
  coincide: boolean
}

export interface ResultadoControl {
  coincide: boolean
  faltanEnBacarnet: ItemControl[]
  sobranEnBacarnet: ItemControl[]
  porDia: ControlDia[]
  /** Misma posición que las filas del extracto. null si no hubo pareja en BacarNet. */
  categoriaIdPorFila: Array<string | null>
}

export interface ResumenExtracto {
  saldoInicialCentavos: number
  saldoFinalCentavos: number
  totalDebitosCentavos: number
  totalCreditosCentavos: number
  cantidad: number
}

export interface FilaExtractoVista {
  fecha: string
  concepto: string
  categoria: string
  tipo: TipoMovimientoExtracto
  debitoCentavos: number
  creditoCentavos: number
  saldoCentavos: number
}
