import type { BancoNombre, Moneda, TipoCuenta } from '../domain/cuenta.types.js'

export interface CuentaDTO {
  cuentaId: string
  bancoNombre: BancoNombre
  bancoCodigoInterbanking: string
  tipo: TipoCuenta
  moneda: Moneda
  descubiertoCentavos: number | null
  /** Solo CC; null en USD. */
  descubiertoVigenteDesde: Date | null
}

export interface SaldoDTO {
  cuentaId: string
  saldoActualCentavos: number
}

export interface SaldoDiarioHoyDTO {
  saldoInicioCentavos: number
  saldoActualCentavos: number
}

export interface SaldoDiarioDiaDTO {
  fecha: string
  saldoFinCentavos: number
  debitosCentavos: number | null
  creditosCentavos: number | null
}

export interface SaldosDiariosCuentaDTO {
  cuentaId: string
  bancoNombre: BancoNombre
  moneda: Moneda
  hoy: SaldoDiarioHoyDTO | null
  dias: SaldoDiarioDiaDTO[]
}

export interface BankDataProvider {
  getAccounts(): Promise<CuentaDTO[]>
  getBalances(): Promise<SaldoDTO[]>
  getSaldosDiarios?(input: { desde: string; hasta: string }): Promise<SaldosDiariosCuentaDTO[]>
}
