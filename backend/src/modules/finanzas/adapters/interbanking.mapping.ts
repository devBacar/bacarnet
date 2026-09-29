import type { BancoNombre, Moneda, TipoCuenta } from '../domain/cuenta.types.js'
import type {
  CuentaDTO,
  SaldoDTO,
  SaldoDiarioDiaDTO,
  SaldosDiariosCuentaDTO,
} from './bank-provider.types.js'

/** Códigos BCRA usados por Bacarsa (Interbanking suele enviar 3 dígitos, ej. 034). */
export const INTERBANKING_BANK_NUMBER_TO_NOMBRE: Record<string, BancoNombre> = {
  '034': 'Patagonia',
  '305': 'Julio',
  '020': 'Córdoba',
}

export interface InterbankingHistoricalBalance {
  operation_date?: string
  day_balance?: number
  total_debits?: number
  total_credits?: number
}

export interface InterbankingBalanceAccount {
  bank_number: string | number
  currency: string
  account_number?: string
  account_type: string
  account_name?: string
  row_date?: string
  balances?: {
    current_operating_balance?: number
    countable_balance?: number
    initial_operating_balance?: number
    projected_balance_24hs?: number
    projected_balance_48hs?: number
  }
  historical_balances?: InterbankingHistoricalBalance[]
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

export function centavosDesdePesos(amount: number): number {
  return Math.round(Number(amount) * 100)
}

function centavosSiNumero(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return centavosDesdePesos(value)
}

export function saldoCentavosFromInterbanking(account: InterbankingBalanceAccount): number {
  const balances = account.balances ?? {}
  const amount =
    balances.current_operating_balance ??
    balances.countable_balance ??
    0
  return centavosDesdePesos(Number(amount))
}

function textoCampo(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function takeCuentaId(
  bancoNombre: BancoNombre,
  tipo: TipoCuenta,
  accountNumber: string,
  usedIds: Set<string>,
): string {
  let cuentaId = `${cuentaSlug(bancoNombre)}-${tipo.toLowerCase()}`
  if (usedIds.has(cuentaId)) {
    cuentaId = `${cuentaId}-${accountNumber.replace(/\D/g, '').slice(-6) || 'dup'}`
  }
  usedIds.add(cuentaId)
  return cuentaId
}

function fechaOperacion(operationDate: string | undefined): string | null {
  if (!operationDate) return null
  const fecha = operationDate.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null
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
    const bankNumber = textoCampo(row.bank_number)
    const accountNumber = textoCampo(row.account_number)
    const bancoNombre = resolveBancoNombre(bankNumber)
    if (!bancoNombre) continue

    const tipo = resolveTipoCuenta(textoCampo(row.account_type), textoCampo(row.currency))
    if (!tipo) continue

    const moneda = resolveMoneda(textoCampo(row.currency), tipo)
    const cuentaId = takeCuentaId(bancoNombre, tipo, accountNumber, usedIds)

    const saldoActualCentavos = saldoCentavosFromInterbanking(row)
    const bancoCodigoInterbanking = `${normalizeInterbankingBankNumber(bankNumber)}-${accountNumber}`

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

/**
 * Cierre diario del banco. `day_balance` es el saldo al terminar ese día.
 * El saldo de hoy va aparte: arranque (`initial_operating`) y saldo de ahora (`current_operating`).
 * Los proyectados a 24/48 hs no se usan.
 */
export function mapInterbankingSaldosDiarios(
  accounts: InterbankingBalanceAccount[],
): SaldosDiariosCuentaDTO[] {
  const usedIds = new Set<string>()
  const out: SaldosDiariosCuentaDTO[] = []

  for (const row of accounts) {
    const bankNumber = textoCampo(row.bank_number)
    const bancoNombre = resolveBancoNombre(bankNumber)
    if (!bancoNombre) continue

    const tipo = resolveTipoCuenta(textoCampo(row.account_type), textoCampo(row.currency))
    if (!tipo) continue

    const moneda = resolveMoneda(textoCampo(row.currency), tipo)
    const cuentaId = takeCuentaId(bancoNombre, tipo, textoCampo(row.account_number), usedIds)
    const balances = row.balances ?? {}
    const saldoInicio = centavosSiNumero(balances.initial_operating_balance)
    const saldoActual = centavosSiNumero(balances.current_operating_balance)

    const diasPorFecha = new Map<string, SaldoDiarioDiaDTO>()
    for (const historico of row.historical_balances ?? []) {
      const fecha = fechaOperacion(historico.operation_date)
      const saldoFinCentavos = centavosSiNumero(historico.day_balance)
      if (!fecha || saldoFinCentavos == null) continue
      diasPorFecha.set(fecha, {
        fecha,
        saldoFinCentavos,
        debitosCentavos: centavosSiNumero(historico.total_debits),
        creditosCentavos: centavosSiNumero(historico.total_credits),
      })
    }

    out.push({
      cuentaId,
      bancoNombre,
      moneda,
      hoy:
        saldoInicio == null || saldoActual == null
          ? null
          : { saldoInicioCentavos: saldoInicio, saldoActualCentavos: saldoActual },
      dias: [...diasPorFecha.values()],
    })
  }

  return out
}
