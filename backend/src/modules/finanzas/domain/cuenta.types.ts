import type { Timestamp } from 'firebase-admin/firestore'

export type BancoNombre = 'Patagonia' | 'Julio' | 'Córdoba'

export type TipoCuenta = 'CA' | 'CC' | 'USD'

export type Moneda = 'ARS' | 'USD'

export interface CuentaDocument {
  bancoNombre: BancoNombre
  bancoCodigoInterbanking: string
  tipo: TipoCuenta
  moneda: Moneda
  saldoActualCentavos: number
  descubiertoCentavos: number | null
  descubiertoVigenteDesde: Timestamp | null
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
  CA: 'Caja de Ahorro',
  CC: 'Cuenta Corriente',
  USD: 'Cuenta USD',
}
