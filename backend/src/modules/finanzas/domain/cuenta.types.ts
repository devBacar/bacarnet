import type { Timestamp } from 'firebase-admin/firestore'

export type BancoNombre = 'Patagonia' | 'Julio' | 'Córdoba'

export type TipoCuenta = 'CC' | 'USD'

export type Moneda = 'ARS' | 'USD'

export type OrigenSaldo = 'interbanking' | 'manual'

export interface CuentaDocument {
  bancoNombre: BancoNombre
  bancoCodigoInterbanking: string
  tipo: TipoCuenta
  moneda: Moneda
  origenSaldo: OrigenSaldo
  saldoActualCentavos: number
  descubiertoCentavos: number | null
  descubiertoVigenteDesde: Timestamp | null
  saldoActualizadoManualmenteEl: Timestamp | null
  /** Email del usuario que cargó el saldo manual (legible en UI). */
  saldoActualizadoManualmentePor: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

export interface SaldoSnapshotDocument {
  saldoCierreCentavos: number
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

export const TIPO_CUENTA_LABEL: Record<TipoCuenta, string> = {
  CC: 'Cuenta Corriente',
  USD: 'Cuenta USD',
}
