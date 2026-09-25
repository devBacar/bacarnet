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

export interface BankDataProvider {
  getAccounts(): Promise<CuentaDTO[]>
  getBalances(): Promise<SaldoDTO[]>
}
