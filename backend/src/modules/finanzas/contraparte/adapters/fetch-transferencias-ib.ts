import type { InterbankingInfoSession } from '../../movimientos/adapters/interbanking-movimientos.js'
import {
  parseDetalleTransferencias,
  type TransferenciaIbRecibida,
} from '../domain/fuente-interbanking.js'

const API_ORIGIN = 'https://api-gw.interbanking.com.ar/api/prod'
const PAGE_LIMIT = 100
const MAX_PAGES = 40

/**
 * GET /v1/transfers/details (Transferencias de Información Financiera).
 * Usa el token de la misma sesión que los movimientos. No escribe nada.
 */
export async function fetchTransferenciasIb(input: {
  session: InterbankingInfoSession
  desde: string
  hasta: string
}): Promise<TransferenciaIbRecibida[]> {
  const todas: TransferenciaIbRecibida[] = []
  const vistas = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = await getPage({ ...input, page })
    const filas = parseDetalleTransferencias(body)
    if (filas.length === 0) break
    let nuevas = 0
    for (const fila of filas) {
      if (vistas.has(fila.id)) continue
      vistas.add(fila.id)
      todas.push(fila)
      nuevas += 1
    }
    if (nuevas === 0 || filas.length < PAGE_LIMIT) break
    const total = totalRows(body)
    if (total != null && todas.length >= total) break
  }
  return todas
}

function totalRows(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null
  const general = (body as { general_data?: { total_rows?: unknown } }).general_data
  const total = Number(general?.total_rows)
  return Number.isFinite(total) ? total : null
}

async function getPage(input: {
  session: InterbankingInfoSession
  desde: string
  hasta: string
  page: number
}): Promise<unknown> {
  const params = new URLSearchParams({
    'customer-id': input.session.customerId,
    'date-since': input.desde,
    'date-until': input.hasta,
    limit: String(PAGE_LIMIT),
    page: String(input.page),
  })
  const url = `${API_ORIGIN}/v1/transfers/details?${params}`
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
  if (res.ok) return body
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const message = typeof record.message === 'string' && record.message ? record.message : `HTTP ${res.status}`
  throw new Error(`Interbanking transferencias ${input.desde}..${input.hasta} HTTP ${res.status}: ${message}`)
}
