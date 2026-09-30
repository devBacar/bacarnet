import type { CuentaCorrienteObjetivo, InterbankingInfoSession } from '../../movimientos/adapters/interbanking-movimientos.js'
import {
  listCuentasCorrientesArs,
  openInterbankingInfoSession,
} from '../../movimientos/adapters/interbanking-movimientos.js'
import { ExtractoBancoError, ExtractoConsultaError } from '../domain/extracto.errors.js'
import type { ExtractoBanco } from '../domain/extracto.types.js'
import { normalizarStatements, unirDias } from '../domain/normalizar-extracto.js'
import type { DiaExtracto } from '../domain/extracto.types.js'
import { partirPeriodoEnTramos } from '../domain/periodo.js'

const API_ORIGIN = 'https://api-gw.interbanking.com.ar/api/prod'
/**
 * `limit`, `page` y `total_rows` cuentan MOVIMIENTOS (no días): un mismo día puede venir partido
 * entre dos páginas y `unirDias` lo junta. El banco acepta 1000 por página (Córdoba ~9000/mes).
 */
const LIMITE_PAGINA = 1000
const MAX_PAGINAS = 100
const MAX_INTENTOS = 3

export interface ExtractoFetchDeps {
  session?: InterbankingInfoSession
  cuentas?: CuentaCorrienteObjetivo[]
  fetchImpl?: typeof fetch
  /** Para tests. En producción se usa el límite del spec (100). */
  limit?: number
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function mensajeBanco(status: number, code: string | null): string {
  if (code === '1049') return 'El banco solo permite extractos de los últimos 180 días.'
  if (code === '1048') return 'La fecha hasta tiene que ser igual o posterior a la fecha desde.'
  if (code === '1043') return 'El banco no encontró esa cuenta.'
  if (code === '1040') return 'El banco no aceptó las fechas.'
  if (status === 404) return 'El banco no encontró el extracto para ese período.'
  return 'No se pudo bajar el extracto del banco. Probá de nuevo en un rato.'
}

function contarMovimientos(statements: unknown[]): number {
  let total = 0
  for (const statement of statements) {
    const detalle = statement && typeof statement === 'object'
      ? (statement as Record<string, unknown>).movement_detail
      : null
    if (Array.isArray(detalle)) total += detalle.length
  }
  return total
}

function totalRowsDe(body: Record<string, unknown>): number | null {
  const general = body.general_data
  if (!general || typeof general !== 'object') return null
  const total = (general as Record<string, unknown>).total_rows
  const n = typeof total === 'number' ? total : Number(total)
  return Number.isFinite(n) ? n : null
}

async function pedirPagina(input: {
  fetchImpl: typeof fetch
  session: InterbankingInfoSession
  cuenta: CuentaCorrienteObjetivo
  desde: string
  hasta: string
  page: number
  limit: number
}): Promise<{ statements: unknown[]; totalRows: number | null }> {
  const params = new URLSearchParams({
    'customer-id': input.session.customerId,
    'bank-number': input.cuenta.bancoNumero,
    'account-type': 'CC',
    currency: 'ARS',
    'date-since': input.desde,
    'date-until': input.hasta,
    limit: String(input.limit),
    page: String(input.page),
  })
  const url = `${API_ORIGIN}/v1/accounts/${encodeURIComponent(input.cuenta.numeroCuenta)}/statements?${params}`

  let ultimo: ExtractoBancoError | null = null
  for (let intento = 1; intento <= MAX_INTENTOS; intento += 1) {
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
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    if (res.ok) {
      const statements = Array.isArray(record.statements) ? record.statements : []
      return { statements, totalRows: totalRowsDe(record) }
    }

    const code = record.code != null ? String(record.code) : null
    const detalle = typeof record.message === 'string' ? record.message : text.slice(0, 180)
    ultimo = new ExtractoBancoError(mensajeBanco(res.status, code), res.status, code, detalle)
    if (res.status !== 429 && res.status < 500) throw ultimo
    await esperar(400 * intento)
  }
  throw ultimo ?? new ExtractoBancoError('No se pudo bajar el extracto del banco. Probá de nuevo en un rato.')
}

async function bajarTramo(input: {
  fetchImpl: typeof fetch
  session: InterbankingInfoSession
  cuenta: CuentaCorrienteObjetivo
  desde: string
  hasta: string
  limit: number
}): Promise<DiaExtracto[]> {
  const cuenta = {
    cuentaId: input.cuenta.cuentaId,
    bancoNombre: input.cuenta.bancoNombre,
    bancoNumero: input.cuenta.bancoNumero,
    numeroCuenta: input.cuenta.numeroCuenta,
  }
  const dias: DiaExtracto[] = []
  const paginasVistas = new Set<string>()
  let juntados = 0
  let totalRows: number | null = null

  for (let page = 0; page < MAX_PAGINAS; page += 1) {
    const respuesta = await pedirPagina({ ...input, page })
    if (respuesta.totalRows != null) totalRows = respuesta.totalRows
    if (respuesta.statements.length === 0) break

    const firma = JSON.stringify(respuesta.statements)
    if (paginasVistas.has(firma)) break
    paginasVistas.add(firma)

    dias.push(...normalizarStatements(respuesta.statements, cuenta))
    const movimientosEnPagina = contarMovimientos(respuesta.statements)
    juntados += movimientosEnPagina
    const paginaCorta = movimientosEnPagina < input.limit
    const yaEstanTodos = totalRows != null && juntados >= totalRows
    if (paginaCorta || yaEstanTodos) break
    if (page + 1 >= MAX_PAGINAS) {
      throw new ExtractoBancoError('El extracto vino incompleto. Achicá el período y probá de nuevo.')
    }
  }

  return dias
}

/**
 * Extracto oficial de una cuenta corriente en pesos.
 * Parte el período en tramos de 60 días y, dentro de cada tramo, recorre las páginas.
 * No escribe nada: solo lee.
 */
export async function fetchExtracto(input: {
  cuentaId: string
  desde: string
  hasta: string
  deps?: ExtractoFetchDeps
}): Promise<ExtractoBanco> {
  const session = input.deps?.session ?? (await openInterbankingInfoSession())
  const cuentas = input.deps?.cuentas ?? (await listCuentasCorrientesArs(session))
  const cuenta = cuentas.find((item) => item.cuentaId === input.cuentaId)
  if (!cuenta) {
    throw new ExtractoConsultaError('El banco no tiene esa cuenta corriente en pesos.')
  }

  const fetchImpl = input.deps?.fetchImpl ?? fetch
  const limit = input.deps?.limit ?? LIMITE_PAGINA
  const tramos = partirPeriodoEnTramos(input.desde, input.hasta)
  const dias: DiaExtracto[] = []
  for (const tramo of tramos) {
    const delTramo = await bajarTramo({
      fetchImpl,
      session,
      cuenta,
      desde: tramo.desde,
      hasta: tramo.hasta,
      limit,
    })
    dias.push(...delTramo)
  }

  return {
    cuentaId: cuenta.cuentaId,
    bancoNombre: cuenta.bancoNombre,
    bancoNumero: cuenta.bancoNumero,
    numeroCuenta: cuenta.numeroCuenta,
    desde: input.desde,
    hasta: input.hasta,
    dias: unirDias(dias),
  }
}
