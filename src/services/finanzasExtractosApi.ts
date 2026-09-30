import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type ExtractoTipo = 'debito' | 'credito'

export interface ExtractoFila {
  fecha: string
  concepto: string
  categoria: string
  tipo: ExtractoTipo
  debitoCentavos: number
  creditoCentavos: number
  saldoCentavos: number
}

export interface ExtractoControlItem {
  fecha: string
  concepto: string
  tipo: ExtractoTipo
  montoCentavos: number
}

export interface ExtractoControlDia {
  fecha: string
  debitosExtractoCentavos: number
  creditosExtractoCentavos: number
  debitosBacarnetCentavos: number
  creditosBacarnetCentavos: number
  coincide: boolean
}

export interface ExtractoConsulta {
  cuenta: {
    id: string
    bancoNombre: string
    tipo: string
    tipoLabel: string
    numeroCuenta: string
  }
  desde: string
  hasta: string
  resumen: {
    saldoInicialCentavos: number
    saldoFinalCentavos: number
    totalDebitosCentavos: number
    totalCreditosCentavos: number
    cantidad: number
  }
  filas: ExtractoFila[]
  control: {
    coincide: boolean
    faltanEnBacarnet: ExtractoControlItem[]
    sobranEnBacarnet: ExtractoControlItem[]
    porDia: ExtractoControlDia[]
    /** El período incluye hoy: el día en curso no se controla (el banco lo cierra a la noche). */
    hoyEnCurso: boolean
    hoy: string
  }
  archivo: string
}

export interface ExtractoPedido {
  cuentaId: string
  desde: string
  hasta: string
}

async function extractosFetch(path: string): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  return fetch(resolveApiUrl(`/api/finanzas/extractos${path}`), {
    headers: { Authorization: `Bearer ${token}` },
  })
}

function paramsDe(pedido: ExtractoPedido): string {
  return new URLSearchParams({
    cuentaId: pedido.cuentaId,
    desde: pedido.desde,
    hasta: pedido.hasta,
  }).toString()
}

async function mensajeDeError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return body?.error || fallback
}

/** Mismo criterio que el archivo que arma el backend. */
export function nombreArchivoExtracto(bancoNombre: string, tipo: string, desde: string, hasta: string): string {
  const banco = bancoNombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w .()-]+/g, '')
    .trim()
  const periodo = desde.slice(0, 7) === hasta.slice(0, 7) ? desde.slice(0, 7) : `${desde}_${hasta}`
  return `Extracto ${banco} ${tipo} ${periodo}.xlsx`
}

function nombreDesdeHeader(header: string | null): string | null {
  if (!header) return null
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1])
    } catch {
      return null
    }
  }
  const plano = /filename="([^"]+)"/i.exec(header)
  return plano?.[1] ?? null
}

function guardarBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function fetchExtracto(pedido: ExtractoPedido): Promise<ExtractoConsulta> {
  const res = await extractosFetch(`?${paramsDe(pedido)}`)
  if (!res.ok) throw new Error(await mensajeDeError(res, 'No se pudo ver el extracto'))
  return res.json() as Promise<ExtractoConsulta>
}

export async function descargarExtractoExcel(pedido: ExtractoPedido, nombreLocal: string): Promise<void> {
  const res = await extractosFetch(`/excel?${paramsDe(pedido)}`)
  if (!res.ok) throw new Error(await mensajeDeError(res, 'No se pudo bajar el Excel'))
  const blob = await res.blob()
  if (blob.size < 1) throw new Error('El Excel vino vacío')
  const filename = nombreDesdeHeader(res.headers.get('Content-Disposition')) || nombreLocal
  guardarBlob(blob, filename)
}
