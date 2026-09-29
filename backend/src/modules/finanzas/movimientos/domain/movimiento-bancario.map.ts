import type { BancoNombre } from '../../domain/cuenta.types.js'
import type { MovimientoBancarioTipo } from './movimiento-bancario.types.js'

export interface InterbankingMovementRow {
  operation_code_ib?: unknown
  operation_code_bank?: unknown
  code_description_ib?: unknown
  code_description_bank?: unknown
  customer_cuit?: unknown
  depositor_description?: unknown
  amount?: unknown
  voucher_number?: unknown
  process_date?: unknown
  debit_credit_type?: unknown
  correlative_number?: unknown
}

export interface MovimientoBancarioMapped {
  cuentaId: string
  bancoNombre: BancoNombre
  bancoNumero: string
  numeroCuenta: string
  moneda: 'ARS'
  tipo: MovimientoBancarioTipo
  montoCentavos: number
  fechaProceso: string
  descripcion: string
  codeDescriptionBank: string | null
  codeDescriptionIb: string | null
  depositorDescription: string | null
  customerCuit: string | null
  operationCodeBank: string
  operationCodeIb: string
  voucherNumber: number | null
  correlativeNumber: number | null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalText(value: unknown): string | null {
  const trimmed = text(value)
  return trimmed.length > 0 ? trimmed : null
}

/** Centavos con signo. `toFixed(2)` evita el error de binario (4892255.76). */
export function amountToSignedCentavos(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error('Importe de movimiento inválido')
  }
  const negative = amount < 0
  const [whole, frac = '00'] = Math.abs(amount).toFixed(2).split('.')
  const centavos = Number(whole) * 100 + Number(frac)
  return negative ? -centavos : centavos
}

export function mapDebitCreditType(raw: unknown): MovimientoBancarioTipo {
  const value = text(raw).toUpperCase()
  if (value === 'D' || value === 'DEBITO' || value === 'DÉBITO') return 'debito'
  if (value === 'C' || value === 'CREDITO' || value === 'CRÉDITO') return 'credito'
  throw new Error(`debit_credit_type no reconocido: ${value || '(vacío)'}`)
}

export function fechaProcesoFromInterbanking(raw: unknown): string {
  const value = text(raw)
  const day = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`process_date inválida: ${value || '(vacía)'}`)
  }
  return day
}

function integerOrNull(raw: unknown, options?: { zeroIsNull?: boolean }): number | null {
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(text(raw))
  if (!Number.isFinite(n)) return null
  if (options?.zeroIsNull && n === 0) return null
  return Math.trunc(n)
}

/**
 * El banco a veces manda este texto en el día en curso (`movement-type=dia`)
 * mientras el código identificable viaja en `code_description_ib`.
 */
const DESCRIPCION_BANCO_SIN_DATO = new Set(['NO INFORMADO', 'NO INFORMADA', 'S/D', 'N/A', '-', '.'])

/**
 * Descripción visible: el texto del banco. Si viene vacío o como "NO INFORMADO",
 * se usa la descripción de Interbanking, que es la que matchean las reglas.
 */
export function descripcionVisible(row: InterbankingMovementRow): string {
  const bank = optionalText(row.code_description_bank)
  const ib = optionalText(row.code_description_ib)
  if (bank && !DESCRIPCION_BANCO_SIN_DATO.has(bank.toUpperCase())) return bank
  return ib ?? bank ?? 'Movimiento'
}

export function mapInterbankingMovement(input: {
  row: InterbankingMovementRow
  cuentaId: string
  bancoNombre: BancoNombre
  bancoNumero: string
  numeroCuenta: string
}): MovimientoBancarioMapped {
  const amount = input.row.amount
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new Error('El movimiento no trae amount numérico')
  }
  const signedCentavos = amountToSignedCentavos(amount)

  return {
    cuentaId: input.cuentaId,
    bancoNombre: input.bancoNombre,
    bancoNumero: input.bancoNumero,
    numeroCuenta: input.numeroCuenta,
    moneda: 'ARS',
    tipo: mapDebitCreditType(input.row.debit_credit_type),
    montoCentavos: Math.abs(signedCentavos),
    fechaProceso: fechaProcesoFromInterbanking(input.row.process_date),
    descripcion: descripcionVisible(input.row),
    codeDescriptionBank: optionalText(input.row.code_description_bank),
    codeDescriptionIb: optionalText(input.row.code_description_ib),
    depositorDescription: optionalText(input.row.depositor_description),
    customerCuit: optionalText(input.row.customer_cuit),
    operationCodeBank: text(input.row.operation_code_bank),
    operationCodeIb: text(input.row.operation_code_ib),
    voucherNumber: integerOrNull(input.row.voucher_number, { zeroIsNull: true }),
    correlativeNumber: integerOrNull(input.row.correlative_number),
  }
}
