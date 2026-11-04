import { armarTableroCombustible } from '../domain/calcular.js'
import type { TableroCombustible } from '../domain/tipos.js'
import { cargarComprasCombustible, cargarUnegocio, PRIMER_MES_CON_DATOS } from './combustible-tablero.repository.js'

/** Cache simple en memoria (se pierde en cada deploy/restart). Dataset chico y de bajo tráfico: alcanza. */
const CACHE = new Map<string, { hasta: number; payload: TableroCombustible }>()
const CACHE_MINUTOS = 15

export async function obtenerTableroCombustible(input: { mes: string }): Promise<TableroCombustible> {
  const cache = CACHE.get(input.mes)
  if (cache && cache.hasta > Date.now()) return cache.payload

  const [filas, unegocio] = await Promise.all([cargarComprasCombustible(input.mes), cargarUnegocio()])

  const payload = armarTableroCombustible({
    mes: input.mes,
    primerMesConDatos: PRIMER_MES_CON_DATOS,
    filas,
    unegocio,
    generadoEn: new Date().toISOString(),
  })

  CACHE.set(input.mes, { hasta: Date.now() + CACHE_MINUTOS * 60_000, payload })
  return payload
}
