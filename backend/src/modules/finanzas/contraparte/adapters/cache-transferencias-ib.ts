import { addIsoDays, diasEntre, tramosDeDias } from '../domain/dias-habiles.js'
import type { TransferenciaIbRecibida } from '../domain/fuente-interbanking.js'

const CACHE_PASADO_MS = 12 * 60 * 60 * 1000
const CACHE_HOY_MS = 10 * 60 * 1000

interface EntradaCache {
  filas: TransferenciaIbRecibida[]
  at: number
}

const porDia = new Map<string, EntradaCache>()

export function vaciarCacheTransferenciasIb(): void {
  porDia.clear()
}

function vigente(dia: string, hoy: string, now: number): boolean {
  const entrada = porDia.get(dia)
  if (!entrada) return false
  const ttl = dia < hoy ? CACHE_PASADO_MS : CACHE_HOY_MS
  return now - entrada.at < ttl
}

/**
 * Pide solo los días que no están en cache y los guarda de a uno,
 * aunque el GET venga en un rango. Así el próximo movimiento del mismo día no vuelve a pedir.
 */
export async function transferenciasIbPorDia(input: {
  desde: string
  hasta: string
  hoy: string
  now?: number
  fetchRango: (desde: string, hasta: string) => Promise<TransferenciaIbRecibida[]>
}): Promise<TransferenciaIbRecibida[]> {
  const now = input.now ?? Date.now()
  const pedidos = diasEntre(input.desde, input.hasta)
  const faltantes = pedidos.filter((dia) => !vigente(dia, input.hoy, now))
  if (faltantes.length > 0) {
    const grupos = agruparFaltantes(faltantes)
    for (const grupo of grupos) {
      const filas = await input.fetchRango(grupo.desde, grupo.hasta)
      const cubiertos = new Set(diasEntre(grupo.desde, grupo.hasta))
      for (const dia of cubiertos) {
        porDia.set(dia, { filas: filas.filter((fila) => fila.fecha === dia), at: now })
      }
    }
  }
  return pedidos.flatMap((dia) => porDia.get(dia)?.filas ?? [])
}

function agruparFaltantes(dias: string[]): Array<{ desde: string; hasta: string }> {
  const ordenados = [...dias].sort()
  const grupos: Array<{ desde: string; hasta: string }> = []
  let desde = ordenados[0]
  let hasta = ordenados[0]
  if (!desde || !hasta) return []
  for (const dia of ordenados.slice(1)) {
    const span = tramosDeDias(desde, dia, 60)
    const cabeEnUnTramo = span.length === 1
    const contiguoOCerca = dia <= addIsoDays(hasta, 60)
    if (cabeEnUnTramo && contiguoOCerca) {
      hasta = dia
      continue
    }
    grupos.push({ desde, hasta })
    desde = dia
    hasta = dia
  }
  grupos.push({ desde, hasta })
  return grupos
}
