import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type MovimientoTipo = 'debito' | 'credito'

export interface MovimientoListItem {
  id: string
  cuentaId: string
  bancoNombre: string
  fechaProceso: string
  descripcion: string
  contraparte: string | null
  customerCuit: string | null
  tipo: MovimientoTipo
  montoCentavos: number
}

export interface MovimientosListResponse {
  cuentaId: string
  desde: string
  hasta: string
  tipo: MovimientoTipo | null
  q: string | null
  page: number
  limit: number
  total: number
  totales: {
    entradasCentavos: number
    salidasCentavos: number
    cantidad: number
  }
  movimientos: MovimientoListItem[]
}

export interface MovimientosListFilters {
  cuentaId: string
  desde: string
  hasta: string
  tipo?: '' | MovimientoTipo
  q?: string
  page?: number
  limit?: number
}

async function movimientosFetch(path: string): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  return fetch(resolveApiUrl(`/api/finanzas/movimientos${path}`), {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function fetchMovimientos(filters: MovimientosListFilters): Promise<MovimientosListResponse> {
  const params = new URLSearchParams({
    cuentaId: filters.cuentaId,
    desde: filters.desde,
    hasta: filters.hasta,
  })
  if (filters.tipo) params.set('tipo', filters.tipo)
  if (filters.q?.trim()) params.set('q', filters.q.trim())
  if (filters.page) params.set('page', String(filters.page))
  if (filters.limit) params.set('limit', String(filters.limit))

  const res = await movimientosFetch(`?${params.toString()}`)
  const body = (await res.json().catch(() => null)) as { error?: string } | MovimientosListResponse | null
  if (!res.ok) {
    throw new Error(body && 'error' in body && body.error ? body.error : 'No se pudieron cargar los movimientos')
  }
  return body as MovimientosListResponse
}
