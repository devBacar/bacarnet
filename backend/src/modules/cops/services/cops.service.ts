import type { CopsSnapshot } from '../domain/tipos.js'
import { validarSnapshot } from '../domain/validar.js'

const CACHE_TTL_MS = 5 * 60 * 1000

export class CopsServiceError extends Error {
  constructor(
    readonly status: 401 | 502 | 503,
    message: string,
  ) {
    super(message)
  }
}

interface EnCache {
  expiresAt: number
  data: CopsSnapshot
}

let cache: EnCache | null = null

/** Para los tests. */
export function vaciarCacheCops(): void {
  cache = null
}

function configDesdeEnv(): { endpoint: string; empresaId: string; apiKey: string } {
  const endpoint = process.env.COPS_ENDPOINT?.trim() ?? ''
  const empresaId = process.env.COPS_EMPRESA_ID?.trim() ?? ''
  const apiKey = process.env.COPS_API_KEY?.trim() ?? ''
  if (!endpoint || !empresaId || !apiKey) {
    throw new CopsServiceError(503, 'Datos aún no disponibles, reintentando...')
  }
  return { endpoint, empresaId, apiKey }
}

function armarUrl(endpoint: string, empresaId: string): string {
  const url = new URL(endpoint)
  url.searchParams.set('empresaId', empresaId)
  return url.toString()
}

/**
 * Obtiene el snapshot COPS vía el endpoint externo (API key solo en el backend).
 * Cachea ~5 min en memoria para no pegarle en cada refresco de pantalla.
 */
export async function obtenerSnapshotCops(fetchFn: typeof fetch = fetch): Promise<CopsSnapshot> {
  const ahora = Date.now()
  if (cache && cache.expiresAt > ahora) return cache.data

  const { endpoint, empresaId, apiKey } = configDesdeEnv()
  let res: Response
  try {
    res = await fetchFn(armarUrl(endpoint, empresaId), {
      method: 'GET',
      headers: { 'x-api-key': apiKey, Accept: 'application/json' },
    })
  } catch {
    throw new CopsServiceError(503, 'Datos aún no disponibles, reintentando...')
  }

  if (res.status === 401 || res.status === 403) {
    throw new CopsServiceError(401, 'Acceso no autorizado — contactar a administrador COPS')
  }
  if (!res.ok) {
    throw new CopsServiceError(503, 'Datos aún no disponibles, reintentando...')
  }

  let raw: unknown
  try {
    raw = await res.json()
  } catch {
    throw new CopsServiceError(502, 'La respuesta de COPS no es válida')
  }

  const validacion = validarSnapshot(raw)
  if (!validacion.ok) throw new CopsServiceError(502, validacion.error)

  cache = { expiresAt: ahora + CACHE_TTL_MS, data: validacion.data }
  return validacion.data
}
