import { auth } from './firebase'
import { resolveApiUrl } from './resolveApiUrl'

export type MovimientoTipo = 'debito' | 'credito'

export type ContraparteOrigen =
  | 'manual'
  | 'banco'
  | 'transferencia'
  | 'agenda'
  | 'interbanking'
  | 'directorio'
  | 'categoria'

export interface ContraparteMovimiento {
  nombre: string | null
  cuit: string | null
  origen: ContraparteOrigen | null
}

export interface MovimientoListItem {
  id: string
  cuentaId: string
  bancoNombre: string
  fechaProceso: string
  descripcion: string
  /** Objeto nuevo. Un string es la respuesta vieja (el texto que mandaba el banco). */
  contraparte: ContraparteMovimiento | string | null
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
  /** Agrupación para el cashflow. Vacío si todavía no tiene grupo. */
  grupo: string | null
  /** Movimientos que la tienen asignada. El backend ya ordena por este campo. */
  usos: number
  createdAt: string | null
  createdBy: string
}

export type ReglaCategorizacionTipo = 'descripcion' | 'codigoIb' | 'cuit'

export interface ReglaCategorizacion {
  id: string
  tipo: ReglaCategorizacionTipo
  descripcionExacta: string | null
  codigoIb: string | null
  cuit: string | null
  categoriaId: string
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

/** Trae ya mismo los movimientos del banco (lo mismo que hace el sync programado cada 30 min). */
export async function syncMovimientosBancarios(): Promise<{ insertados: number; autoCategorizados: number }> {
  const res = await movimientosFetch('/sync', { method: 'POST' })
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string
    insertados?: number
    autoCategorizados?: number
  }
  if (!res.ok) throw new Error(payload.error ?? 'No se pudieron traer los movimientos del banco')
  return { insertados: payload.insertados ?? 0, autoCategorizados: payload.autoCategorizados ?? 0 }
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

export async function crearCategoriaMovimiento(
  nombre: string,
  grupo?: string | null,
): Promise<CategoriaMovimiento> {
  const grupoLimpio = grupo?.trim()
  const res = await finanzasFetch('/api/finanzas/categorias-movimientos', {
    method: 'POST',
    body: JSON.stringify(grupoLimpio ? { nombre, grupo: grupoLimpio } : { nombre }),
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

export async function eliminarCategoriaMovimiento(
  categoriaId: string,
): Promise<{ movimientosDesasignados: number; reglasEliminadas: number }> {
  const res = await finanzasFetch(`/api/finanzas/categorias-movimientos/${encodeURIComponent(categoriaId)}`, {
    method: 'DELETE',
  })
  const body = (await res.json().catch(() => null)) as {
    error?: string
    movimientosDesasignados?: number
    reglasEliminadas?: number
  } | null
  if (!res.ok) throw new Error(body?.error ?? 'No se pudo eliminar la categoría')
  return {
    movimientosDesasignados: body?.movimientosDesasignados ?? 0,
    reglasEliminadas: body?.reglasEliminadas ?? 0,
  }
}

export async function patchCategoriaMovimiento(
  categoriaId: string,
  patch: { nombre?: string; color?: string | null; grupo?: string | null },
): Promise<CategoriaMovimiento> {
  const res = await finanzasFetch(`/api/finanzas/categorias-movimientos/${encodeURIComponent(categoriaId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  const body = (await res.json().catch(() => null)) as {
    error?: string
    categoria?: CategoriaMovimiento
  } | null
  if (!res.ok || !body?.categoria) {
    throw new Error(body?.error ?? 'No se pudo guardar la categoría')
  }
  return body.categoria
}

export async function fusionarCategoriaMovimiento(
  categoriaId: string,
  destinoId: string,
): Promise<{ movimientosMovidos: number; reglasMovidas: number }> {
  const res = await finanzasFetch(
    `/api/finanzas/categorias-movimientos/${encodeURIComponent(categoriaId)}/fusionar`,
    {
      method: 'POST',
      body: JSON.stringify({ destinoId }),
    },
  )
  const body = (await res.json().catch(() => null)) as {
    error?: string
    movimientosMovidos?: number
    reglasMovidas?: number
  } | null
  if (!res.ok) throw new Error(body?.error ?? 'No se pudo fusionar la categoría')
  return {
    movimientosMovidos: body?.movimientosMovidos ?? 0,
    reglasMovidas: body?.reglasMovidas ?? 0,
  }
}

/** Crea la regla "descripción exacta → categoría" y categoriza todos los movimientos que ya digan eso. */
export async function crearReglaCategorizacion(input: {
  descripcionExacta: string
  categoriaId: string
}): Promise<{ regla: ReglaCategorizacion; creada: boolean; movimientosActualizados: number }> {
  const res = await finanzasFetch('/api/finanzas/reglas-categorizacion', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => null)) as {
    error?: string
    regla?: ReglaCategorizacion
    creada?: boolean
    movimientosActualizados?: number
  } | null
  if (!res.ok || !body?.regla) throw new Error(body?.error ?? 'No se pudo crear la regla')
  return { regla: body.regla, creada: Boolean(body.creada), movimientosActualizados: body.movimientosActualizados ?? 0 }
}

/** Aplica las reglas ya guardadas a los movimientos que siguen sin categoría. */
export async function aplicarReglasCategorizacion(): Promise<{
  revisados: number
  categorizados: number
  porCategoria: Record<string, number>
}> {
  const res = await finanzasFetch('/api/finanzas/reglas-categorizacion/aplicar', { method: 'POST' })
  const body = (await res.json().catch(() => null)) as {
    error?: string
    revisados?: number
    categorizados?: number
    porCategoria?: Record<string, number>
  } | null
  if (!res.ok) throw new Error(body?.error ?? 'No se pudieron aplicar las reglas')
  return {
    revisados: body?.revisados ?? 0,
    categorizados: body?.categorizados ?? 0,
    porCategoria: body?.porCategoria ?? {},
  }
}

export async function completarContrapartes(): Promise<{
  revisados: number
  actualizados: number
}> {
  const res = await movimientosFetch('/contrapartes/completar', { method: 'POST' })
  const body = (await res.json().catch(() => null)) as {
    error?: string
    revisados?: number
    actualizados?: number
  } | null
  if (!res.ok) throw new Error(body?.error ?? 'No se pudieron completar las contrapartes')
  return { revisados: body?.revisados ?? 0, actualizados: body?.actualizados ?? 0 }
}

export async function actualizarMovimiento(
  movimientoId: string,
  patch: {
    categoriaId?: string | null
    nota?: string | null
    contraparteNombre?: string | null
    contraparteCuit?: string | null
  },
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
