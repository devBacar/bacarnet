import { armarCalendario, type CalendarioFeriados } from '../domain/calendarioFeriados.js'

/** Lee el JSON de https://api.argentinadatos.com/v1/feriados/{anio}. Incluye puentes y días no laborables. */
export function leerRespuestaFeriados(data: unknown): Record<string, string> | null {
  if (!Array.isArray(data)) return null
  const fechas: Record<string, string> = {}
  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const fecha = (item as { fecha?: unknown }).fecha
    const nombre = (item as { nombre?: unknown }).nombre
    if (typeof fecha !== 'string' || typeof nombre !== 'string') continue
    const iso = fecha.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue
    fechas[iso] = fechas[iso] ? `${fechas[iso]} · ${nombre}` : nombre
  }
  return Object.keys(fechas).length ? fechas : null
}

/** Trae el calendario oficial. Si falla o tarda más de 10 segundos, devuelve null. */
export async function traerFeriadosOficiales(
  anio: number,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<Record<string, string> | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetchFn(`https://api.argentinadatos.com/v1/feriados/${anio}`, { signal: ctrl.signal })
    if (!res.ok) return null
    return leerRespuestaFeriados(await res.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function seguro<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}

/**
 * Calendario para el informe: año actual y el siguiente.
 * Siempre se intenta la API primero y se guarda (así entran los puentes que se decretan durante el año).
 * Si la API falla, se usa lo guardado; si tampoco hay, el cálculo (y la lista conocida 2026-2027).
 */
export async function resolverCalendarioFeriados(
  anioActual: number,
  deps: {
    leer?: (anio: number) => Promise<Record<string, string> | null>
    guardar?: (anio: number, fechas: Record<string, string>) => Promise<void>
    traer?: (anio: number) => Promise<Record<string, string> | null>
  } = {},
): Promise<CalendarioFeriados> {
  const anios = [anioActual, anioActual + 1]
  const oficial: Record<number, Record<string, string>> = {}
  try {
    for (const anio of anios) {
      const traido = deps.traer ? await seguro(() => deps.traer!(anio)) : null
      if (traido && Object.keys(traido).length > 0) {
        oficial[anio] = traido
        if (deps.guardar) await seguro(() => deps.guardar!(anio, traido))
        continue
      }
      const guardado = deps.leer ? await seguro(() => deps.leer!(anio)) : null
      if (guardado && Object.keys(guardado).length > 0) oficial[anio] = guardado
    }
    return armarCalendario(anios, oficial)
  } catch {
    return armarCalendario(anios)
  }
}
