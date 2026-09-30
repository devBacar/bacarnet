import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export interface LineaCajaDia {
  detalle: string
  centavos: number
  cantidad: number
  movimientoIds: string[]
  origen: 'manual' | 'sugerido'
  textoBanco: string | null
}

export interface CuadreCajaDia {
  diferenciaCentavos: number | null
  esRedondeo: boolean
  cuadra: boolean
}

export interface BancoCajaDia {
  bancoNombre: string
  cuentaId: string
  arrancaCentavos: number | null
  saldoCentavos: number | null
  descubiertoCentavos: number | null
  faltanteCentavos: number
  origenSaldo: 'banco' | 'cierre15'
  lineas: LineaCajaDia[]
  cuadre: CuadreCajaDia
}

export interface LineaValorCaja {
  detalle: string
  centavos: number
  cantidad: number
}

export interface CajaDiaResponse {
  fecha: string
  bancos: BancoCajaDia[]
  efectivo: {
    arrancaCentavos: number
    saldoCentavos: number
    lineas: LineaValorCaja[]
  }
  cheques: { saldoCentavos: number; lineas: LineaValorCaja[] }
  echeq: { saldoCentavos: number; lineas: LineaValorCaja[] }
  dolares: Array<{ bancoNombre: string; cuentaId: string; saldoCentavos: number }>
  fondos: Array<{ nombre: string; saldoCentavos: number }>
}

export interface DetalleCajaOpcion {
  texto: string
  veces: number
  propio: boolean
}

async function cajaFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  return fetch(resolveApiUrl(`/api/finanzas/caja-dia${path}`), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
}

async function leerError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? fallback)
}

export async function fetchCajaDia(fecha: string): Promise<CajaDiaResponse> {
  const params = new URLSearchParams({ fecha })
  const res = await cajaFetch(`/?${params.toString()}`)
  if (!res.ok) await leerError(res, 'No se pudo armar la caja del día')
  return res.json() as Promise<CajaDiaResponse>
}

export async function fetchDetallesCaja(): Promise<DetalleCajaOpcion[]> {
  const res = await cajaFetch('/detalles')
  if (!res.ok) await leerError(res, 'No se pudieron listar los detalles')
  const body = (await res.json()) as { detalles?: DetalleCajaOpcion[] }
  return body.detalles ?? []
}

export async function guardarDetalleCaja(
  movimientoId: string,
  input: { detalleCaja: string | null; aplicarAlMismoTexto: boolean },
): Promise<void> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  const res = await fetch(resolveApiUrl(`/api/finanzas/movimientos/${encodeURIComponent(movimientoId)}`), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  if (!res.ok) await leerError(res, 'No se pudo guardar el detalle')
}
