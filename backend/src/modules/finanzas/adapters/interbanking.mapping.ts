import type { BancoNombre, Moneda, TipoCuenta } from '../domain/cuenta.types.js'
import type { CuentaDTO, SaldoDTO } from './bank-provider.types.js'

/** Códigos BCRA usados por Bacarsa (Interbanking suele enviar 3 dígitos, ej. 034). */
export const INTERBANKING_BANK_NUMBER_TO_NOMBRE: Record<string, BancoNombre> = {
  '034': 'Patagonia',
  '305': 'Julio',
  '020': 'Córdoba',
}

export interface InterbankingBalanceAccount {
  bank_number: string
  currency: string
  account_number: string
  account_type: string
  account_name?: string
  balances?: {
    current_operating_balance?: number
    countable_balance?: number
  }
}

export function normalizeInterbankingBankNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return raw.trim()
  const n = Number.parseInt(digits, 10)
  if (Number.isNaN(n)) return digits
  return String(n).padStart(3, '0')
}

export function resolveBancoNombre(bankNumber: string): BancoNombre | null {
  const key = normalizeInterbankingBankNumber(bankNumber)
  return INTERBANKING_BANK_NUMBER_TO_NOMBRE[key] ?? null
}

export function resolveTipoCuenta(accountType: string, currency: string): TipoCuenta | null {
  const moneda = currency.trim().toUpperCase()
  if (moneda === 'USD') return 'USD'
  const t = accountType.trim().toUpperCase()
  if (t.startsWith('CC') || t.includes('CORRIENTE')) return 'CC'
  return null
}

export function resolveMoneda(currency: string, tipo: TipoCuenta): Moneda {
  if (tipo === 'USD') return 'USD'
  return currency.trim().toUpperCase() === 'USD' ? 'USD' : 'ARS'
}

export function saldoCentavosFromInterbanking(account: InterbankingBalanceAccount): number {
  const balances = account.balances ?? {}
  const amount =
    balances.current_operating_balance ??
    balances.countable_balance ??
    0
  return Math.round(Number(amount) * 100)
}

function cuentaSlug(banco: BancoNombre): string {
  if (banco === 'Patagonia') return 'patagonia'
  if (banco === 'Julio') return 'julio'
  return 'cordoba'
}

/** Mapea respuesta de /accounts/balances a DTOs internos (solo bancos conocidos). */
export function mapInterbankingBalancesResponse(accounts: InterbankingBalanceAccount[]): {
  accounts: CuentaDTO[]
  balances: SaldoDTO[]
} {
  const usedIds = new Set<string>()
  const outAccounts: CuentaDTO[] = []
  const outBalances: SaldoDTO[] = []

  for (const row of accounts) {
    const bancoNombre = resolveBancoNombre(row.bank_number)
    if (!bancoNombre) continue

    const tipo = resolveTipoCuenta(row.account_type, row.currency)
    if (!tipo) continue

    const moneda = resolveMoneda(row.currency, tipo)
    let cuentaId = `${cuentaSlug(bancoNombre)}-${tipo.toLowerCase()}`
    if (usedIds.has(cuentaId)) {
      cuentaId = `${cuentaId}-${row.account_number.replace(/\D/g, '').slice(-6) || 'dup'}`
    }
    usedIds.add(cuentaId)

    const saldoActualCentavos = saldoCentavosFromInterbanking(row)
    const bancoCodigoInterbanking = `${normalizeInterbankingBankNumber(row.bank_number)}-${row.account_number}`

    outAccounts.push({
      cuentaId,
      bancoNombre,
      bancoCodigoInterbanking,
      tipo,
      moneda,
      descubiertoCentavos: null,
      descubiertoVigenteDesde: null,
    })
    outBalances.push({ cuentaId, saldoActualCentavos })
  }

  return { accounts: outAccounts, balances: outBalances }
}
