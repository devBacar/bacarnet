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
  categoriaId: string | null
  nota: string | null
}

export interface MovimientosListResponse {
  cuentaId: string
  desde: string
  hasta: string
  tipo: MovimientoTipo | null
  categoriaId: string | null
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
  categoriaId?: string
  q?: string
  page?: number
  limit?: number
}

export interface CategoriaMovimiento {
  id: string
  nombre: string
  color: string | null
  createdAt: string | null
  createdBy: string
}

async function finanzasFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  return fetch(resolveApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
}

async function movimientosFetch(path: string, init?: RequestInit): Promise<Response> {
  return finanzasFetch(`/api/finanzas/movimientos${path}`, init)
}

export async function fetchMovimientos(filters: MovimientosListFilters): Promise<MovimientosListResponse> {
  const params = new URLSearchParams({
    cuentaId: filters.cuentaId,
    desde: filters.desde,
    hasta: filters.hasta,
  })
  if (filters.tipo) params.set('tipo', filters.tipo)
  if (filters.categoriaId) params.set('categoriaId', filters.categoriaId)
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

export async function fetchCategoriasMovimientos(): Promise<CategoriaMovimiento[]> {
  const res = await finanzasFetch('/api/finanzas/categorias-movimientos')
  const body = (await res.json().catch(() => null)) as { error?: string; categorias?: CategoriaMovimiento[] } | null
  if (!res.ok) throw new Error(body?.error ?? 'No se pudieron cargar las categorías')
  return body?.categorias ?? []
}

export async function crearCategoriaMovimiento(nombre: string): Promise<CategoriaMovimiento> {
  const res = await finanzasFetch('/api/finanzas/categorias-movimientos', {
    method: 'POST',
    body: JSON.stringify({ nombre }),
  })
  const body = (await res.json().catch(() => null)) as {
    error?: string
    categoria?: CategoriaMovimiento
  } | null
  if (!res.ok || !body?.categoria) {
    throw new Error(body?.error ?? 'No se pudo crear la categoría')
  }
  return body.categoria
}

export async function actualizarMovimiento(
  movimientoId: string,
  patch: { categoriaId?: string | null; nota?: string | null },
): Promise<MovimientoListItem> {
  const res = await movimientosFetch(`/${encodeURIComponent(movimientoId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  const body = (await res.json().catch(() => null)) as { error?: string; movimiento?: MovimientoListItem } | null
  if (!res.ok || !body?.movimiento) {
    throw new Error(body?.error ?? 'No se pudo actualizar el movimiento')
  }
  return body.movimiento
}
