import { amountToSignedCentavos } from '../../movimientos/domain/movimiento-bancario.map.js'
import {
  openInterbankingInfoSession,
  type InterbankingInfoSession,
} from '../../movimientos/adapters/interbanking-movimientos.js'

/**
 * Lectura de GET /v1/transfers/details (Información Financiera, scope info-financiera).
 * No confecciona ni llama al candado de transferencias reales.
 */

const API_ORIGIN = 'https://api-gw.interbanking.com.ar/api/prod'
const DETAILS_PATH = '/v1/transfers/details'
const PAGE_LIMIT = 100
const MAX_PAGES = 40
const VENTANA_DIAS = 60
const ANTIGUEDAD_MAX_DIAS = 180

export interface DetalleTransferenciaInterbanking {
  transferId: string | null
  transactionNumber: string | null
  referenceNumber: string | null
  paymentNumber: string | null
  lotNumber: string | null
  comments: string | null
  status: string
  amountCentavos: number | null
  requestDate: string | null
  debitCbu: string | null
  debitAccountNumber: string | null
  debitBankNumber: string | null
  creditCbu: string | null
  creditAccountNumber: string | null
}

export function diaArgentinaDesdeDate(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

export function sumarDiasIso(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map((part) => Number(part))
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** El spec deja consultar hasta 180 días, contando hoy. */
export function acotarRangoConsulta(
  desde: string,
  hasta: string,
  hoy: string,
): { desde: string; hasta: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return null
  let since = desde
  let until = hasta > hoy ? hoy : hasta
  if (until < since) return null
  const limite = sumarDiasIso(hoy, -(ANTIGUEDAD_MAX_DIAS - 1))
  if (until < limite) return null
  if (since < limite) since = limite
  return { desde: since, hasta: until }
}

/** Periodos de 60 días inclusive, como pide el spec. */
export function ventanasDeConsulta(
  desde: string,
  hasta: string,
  dias = VENTANA_DIAS,
): Array<{ desde: string; hasta: string }> {
  if (hasta < desde) return []
  const ventanas: Array<{ desde: string; hasta: string }> = []
  let cursor = desde
  while (cursor <= hasta) {
    const fin = sumarDiasIso(cursor, dias - 1)
    const hastaVentana = fin < hasta ? fin : hasta
    ventanas.push({ desde: cursor, hasta: hastaVentana })
    if (hastaVentana >= hasta) break
    cursor = sumarDiasIso(hastaVentana, 1)
  }
  return ventanas
}

export function buildTransfersDetailsUrl(input: {
  apiOrigin?: string
  customerId: string
  dateSince: string
  dateUntil: string
  page: number
  limit?: number
}): string {
  const base = (input.apiOrigin ?? API_ORIGIN).replace(/\/+$/, '')
  const url = new URL(`${base}${DETAILS_PATH}`)
  url.searchParams.set('customer-id', input.customerId)
  url.searchParams.set('date-since', input.dateSince)
  url.searchParams.set('date-until', input.dateUntil)
  url.searchParams.set('limit', String(input.limit ?? PAGE_LIMIT))
  url.searchParams.set('page', String(input.page))
  return url.toString()
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function texto(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

export function diaDeRequestDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const digits = String(Math.trunc(value))
    if (/^\d{8}$/.test(digits)) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
    }
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`
  }
  return null
}

function centavosDeImporte(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return amountToSignedCentavos(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim().replace(',', '.'))
    if (!Number.isFinite(parsed)) return null
    return amountToSignedCentavos(parsed)
  }
  return null
}

function cuentaDe(value: unknown): { cbu: string | null; numero: string | null; banco: string | null } {
  const row = asRecord(value)
  if (!row) return { cbu: null, numero: null, banco: null }
  return {
    cbu: texto(row.account_cbu),
    numero: texto(row.account_number),
    banco: texto(row.bank_number),
  }
}

export function parseTransfersDetailsResponse(payload: unknown): {
  transfers: DetalleTransferenciaInterbanking[]
  totalRows: number | null
} {
  const root = asRecord(payload)
  const list = root?.transfers
  const general = asRecord(root?.general_data)
  const totalRaw = general?.total_rows
  const totalRows = typeof totalRaw === 'number' && Number.isFinite(totalRaw) ? totalRaw : null
  if (!Array.isArray(list)) return { transfers: [], totalRows }

  const transfers: DetalleTransferenciaInterbanking[] = []
  for (const item of list) {
    const row = asRecord(item)
    if (!row) continue
    const status = texto(row.status)
    if (!status) continue
    const debit = cuentaDe(row.debit_account)
    const credit = cuentaDe(row.credit_account)
    transfers.push({
      transferId: texto(row.transfer_id),
      transactionNumber: texto(row.transaction_number),
      referenceNumber: texto(row.reference_number),
      paymentNumber: texto(row.payment_number),
      lotNumber: texto(row.lot_number),
      comments: texto(row.comments) ?? texto(row.transfer_comments),
      status,
      amountCentavos: centavosDeImporte(row.amount),
      requestDate: diaDeRequestDate(row.request_date),
      debitCbu: debit.cbu,
      debitAccountNumber: debit.numero,
      debitBankNumber: debit.banco,
      creditCbu: credit.cbu,
      creditAccountNumber: credit.numero,
    })
  }
  return { transfers, totalRows }
}

async function leerPagina(input: {
  session: InterbankingInfoSession
  fetchImpl: typeof fetch
  dateSince: string
  dateUntil: string
  page: number
}): Promise<{ transfers: DetalleTransferenciaInterbanking[]; totalRows: number | null }> {
  const url = buildTransfersDetailsUrl({
    customerId: input.session.customerId,
    dateSince: input.dateSince,
    dateUntil: input.dateUntil,
    page: input.page,
  })
  const token = await input.session.client.getToken()
  const res = await input.fetchImpl(url, {
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
    body = null
  }
  if (!res.ok) {
    const record = asRecord(body)
    const message = texto(record?.message) ?? `HTTP ${res.status}`
    throw new Error(`No se pudo leer el estado de las transferencias (${message})`)
  }
  return parseTransfersDetailsResponse(body)
}

function claveDetalle(detalle: DetalleTransferenciaInterbanking): string {
  return [
    detalle.transferId ?? '',
    detalle.referenceNumber ?? '',
    detalle.requestDate ?? '',
    detalle.debitCbu ?? '',
    detalle.creditCbu ?? '',
    String(detalle.amountCentavos ?? ''),
    detalle.status,
  ].join('|')
}

export async function consultarDetallesTransferencias(input: {
  dateSince: string
  dateUntil: string
  now?: Date
  session?: InterbankingInfoSession
  fetchImpl?: typeof fetch
}): Promise<DetalleTransferenciaInterbanking[]> {
  const hoy = diaArgentinaDesdeDate(input.now ?? new Date())
  const rango = acotarRangoConsulta(input.dateSince, input.dateUntil, hoy)
  if (!rango) return []

  const session = input.session ?? (await openInterbankingInfoSession())
  const fetchImpl = input.fetchImpl ?? fetch
  const vistos = new Set<string>()
  const todos: DetalleTransferenciaInterbanking[] = []

  for (const ventana of ventanasDeConsulta(rango.desde, rango.hasta)) {
    let acumuladas = 0
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const pagina = await leerPagina({
        session,
        fetchImpl,
        dateSince: ventana.desde,
        dateUntil: ventana.hasta,
        page,
      })
      if (pagina.transfers.length === 0) break
      for (const detalle of pagina.transfers) {
        const clave = claveDetalle(detalle)
        if (vistos.has(clave)) continue
        vistos.add(clave)
        todos.push(detalle)
      }
      acumuladas += pagina.transfers.length
      const corto = pagina.transfers.length < PAGE_LIMIT
      const completo = pagina.totalRows != null && acumuladas >= pagina.totalRows
      if (corto || completo) break
    }
  }

  return todos
}
