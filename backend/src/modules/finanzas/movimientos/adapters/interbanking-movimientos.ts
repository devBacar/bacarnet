import { readInterbankingEnvConfig } from '../../adapters/interbanking-provider.js'
import {
  normalizeInterbankingBankNumber,
  resolveBancoNombre,
  resolveTipoCuenta,
} from '../../adapters/interbanking.mapping.js'
import type { InterbankingMovementRow } from '../domain/movimiento-bancario.map.js'

const API_ORIGIN = 'https://api-gw.interbanking.com.ar/api/prod'
/**
 * Se pide todo el rango en UNA página. La paginación `page` de Interbanking
 * repite filas y saltea otras a partir de cierta página (ver types.ts).
 * 90 días de Córdoba CC fueron 25.513 filas / 14 MB con este límite.
 */
const SINGLE_PAGE_LIMIT = 50_000
const MAX_ATTEMPTS = 5

type InfoClient = {
  getToken: () => Promise<string>
  getBalances: () => Promise<{ accounts?: BalanceAccount[] }>
}

type InterbankingModule = {
  createClient: (options: {
    clientId: string
    clientSecret: string
    redirectUrl: string
    customerId: string
    logger: null
  }) => InfoClient
}

interface BalanceAccount {
  bank_number?: string
  currency?: string
  account_number?: string
  account_type?: string
}

export interface CuentaCorrienteObjetivo {
  cuentaId: string
  bancoNombre: 'Patagonia' | 'Julio' | 'Córdoba'
  bancoNumero: string
  numeroCuenta: string
}

interface MovementsPage {
  general_data?: { total_rows?: number }
  movements_detail?: InterbankingMovementRow[]
}

export interface InterbankingInfoSession {
  client: InfoClient
  clientId: string
  customerId: string
}

export class InterbankingMovimientosError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message)
    this.name = 'InterbankingMovimientosError'
  }
}

export async function openInterbankingInfoSession(): Promise<InterbankingInfoSession> {
  const config = readInterbankingEnvConfig()
  const mod = (await import('interbanking-client')) as unknown as InterbankingModule
  return {
    client: mod.createClient({ ...config, logger: null }),
    clientId: config.clientId,
    customerId: config.customerId,
  }
}

function cuentaIdFor(bancoNombre: 'Patagonia' | 'Julio' | 'Córdoba'): string {
  if (bancoNombre === 'Patagonia') return 'patagonia-cc'
  if (bancoNombre === 'Julio') return 'julio-cc'
  return 'cordoba-cc'
}

/** Las CC en ARS de Patagonia, Julio y Córdoba, descubiertas por el mismo GET de saldos. */
export async function listCuentasCorrientesArs(
  session: InterbankingInfoSession,
): Promise<CuentaCorrienteObjetivo[]> {
  const data = await session.client.getBalances()
  const accounts = Array.isArray(data.accounts) ? data.accounts : []
  const found: CuentaCorrienteObjetivo[] = []
  const used = new Set<string>()

  for (const row of accounts) {
    const bancoNombre = resolveBancoNombre(String(row.bank_number ?? ''))
    if (!bancoNombre) continue
    if (resolveTipoCuenta(String(row.account_type ?? ''), String(row.currency ?? '')) !== 'CC') continue
    if (String(row.currency ?? '').trim().toUpperCase() !== 'ARS') continue
    const numeroCuenta = String(row.account_number ?? '').trim()
    if (!numeroCuenta) continue

    let cuentaId = cuentaIdFor(bancoNombre)
    if (used.has(cuentaId)) cuentaId = `${cuentaId}-${numeroCuenta.replace(/\D/g, '').slice(-6)}`
    used.add(cuentaId)

    found.push({
      cuentaId,
      bancoNombre,
      bancoNumero: normalizeInterbankingBankNumber(String(row.bank_number)),
      numeroCuenta,
    })
  }

  found.sort((a, b) => a.cuentaId.localeCompare(b.cuentaId))
  return found
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchSinglePage(input: {
  session: InterbankingInfoSession
  cuenta: CuentaCorrienteObjetivo
  movementType: 'anteriores' | 'dia'
  dateSince?: string
  dateUntil?: string
}): Promise<MovementsPage> {
  const params = new URLSearchParams({
    'customer-id': input.session.customerId,
    'bank-number': input.cuenta.bancoNumero,
    'account-type': 'CC',
    currency: 'ARS',
    limit: String(SINGLE_PAGE_LIMIT),
    page: '0',
  })
  // `dia` es el día de la fecha: el banco rechaza date-since y date-until (código 1052).
  if (input.movementType === 'anteriores') {
    params.set('date-since', input.dateSince ?? '')
    params.set('date-until', input.dateUntil ?? '')
  }
  const url = `${API_ORIGIN}/v2/accounts/${encodeURIComponent(input.cuenta.numeroCuenta)}/movements/${input.movementType}?${params}`

  let lastError: Error | null = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const token = await input.session.client.getToken()
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        client_id: input.session.clientId,
        Accept: 'application/json',
      },
    })
    const text = await res.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = { message: text.slice(0, 300) }
    }
    if (res.ok) return (body ?? {}) as MovementsPage

    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const message =
      typeof record.message === 'string' && record.message
        ? record.message
        : text.replace(/\s+/g, ' ').slice(0, 180) || `HTTP ${res.status}`
    const code = record.code != null ? String(record.code) : null
    const rango =
      input.movementType === 'dia' ? 'dia' : `${input.dateSince}..${input.dateUntil}`
    const err = new InterbankingMovimientosError(
      `Interbanking movimientos ${input.cuenta.cuentaId} ${rango} HTTP ${res.status}${code ? ` ${code}` : ''}: ${message}`,
      res.status,
      code,
    )
    lastError = err
    if (res.status !== 429 && res.status < 500) throw err
    await sleep(1500 * attempt)
  }
  throw lastError ?? new Error(`Interbanking movimientos ${input.cuenta.cuentaId}: sin respuesta`)
}

function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map((part) => Number(part))
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function daysInclusive(since: string, until: string): number {
  const start = Date.parse(`${since}T00:00:00Z`)
  const end = Date.parse(`${until}T00:00:00Z`)
  return Math.round((end - start) / 86_400_000) + 1
}

function isRangeTooWide(err: unknown): boolean {
  return (
    err instanceof InterbankingMovimientosError &&
    err.status === 400 &&
    /fecha|1040|1048|rango|range/i.test(err.message)
  )
}

/**
 * Trae TODAS las filas de [dateSince, dateUntil] sin paginar.
 * Si el banco devuelve menos filas que `total_rows`, o rechaza el rango por
 * ancho, parte el rango en mitades. Un solo día que no cierra es un error.
 */
export async function fetchMovimientosAnterioresCompleto(input: {
  session: InterbankingInfoSession
  cuenta: CuentaCorrienteObjetivo
  dateSince: string
  dateUntil: string
  depth?: number
}): Promise<{ rows: InterbankingMovementRow[]; requests: number }> {
  const depth = input.depth ?? 0
  const days = daysInclusive(input.dateSince, input.dateUntil)
  if (days < 1) return { rows: [], requests: 0 }

  let page: MovementsPage | null = null
  try {
    page = await fetchSinglePage({ ...input, movementType: 'anteriores' })
  } catch (err) {
    if (!isRangeTooWide(err) || days <= 1) throw err
  }

  if (page) {
    const detail = Array.isArray(page.movements_detail) ? page.movements_detail : []
    const declared = Number(page.general_data?.total_rows ?? detail.length)
    if (!Number.isFinite(declared) || detail.length >= declared) {
      return { rows: detail, requests: 1 }
    }
    if (days <= 1) {
      throw new Error(
        `Interbanking devolvió ${detail.length} de ${declared} movimientos para ${input.cuenta.cuentaId} el ${input.dateSince} en una sola página`,
      )
    }
  }

  if (depth > 12) {
    throw new Error(`No se pudo cerrar el rango ${input.dateSince}..${input.dateUntil} de ${input.cuenta.cuentaId}`)
  }

  const midpoint = addIsoDays(input.dateSince, Math.floor(days / 2) - 1)
  await sleep(500)
  const left = await fetchMovimientosAnterioresCompleto({
    ...input,
    dateUntil: midpoint,
    depth: depth + 1,
  })
  await sleep(500)
  const right = await fetchMovimientosAnterioresCompleto({
    ...input,
    dateSince: addIsoDays(midpoint, 1),
    depth: depth + 1,
  })
  return {
    rows: [...left.rows, ...right.rows],
    requests: 1 + left.requests + right.requests,
  }
}

/** Movimientos del día en curso (`movement-type=dia`). Un solo día, una sola página. */
export async function fetchMovimientosDia(input: {
  session: InterbankingInfoSession
  cuenta: CuentaCorrienteObjetivo
  fecha: string
}): Promise<{ rows: InterbankingMovementRow[]; requests: number }> {
  const page = await fetchSinglePage({
    session: input.session,
    cuenta: input.cuenta,
    movementType: 'dia',
  })
  const detail = Array.isArray(page.movements_detail) ? page.movements_detail : []
  const declared = Number(page.general_data?.total_rows ?? detail.length)
  if (Number.isFinite(declared) && detail.length < declared) {
    throw new Error(
      `Interbanking dia devolvió ${detail.length} de ${declared} movimientos para ${input.cuenta.cuentaId} el ${input.fecha}`,
    )
  }
  return { rows: detail, requests: 1 }
}
