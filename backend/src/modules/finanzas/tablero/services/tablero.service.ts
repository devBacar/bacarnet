import { logError } from '../../../../lib/log.js'
import { dateKeyInArgentina } from '../../agenda/domain/vencimiento.alert.js'
import { mesDeFecha } from '../domain/fechas.js'
import { armarTablero, type MonedaTablero, type TableroFinanzas } from '../domain/calcular.js'
import {
  cacheTableroVigente,
  cargarDatosTablero,
  guardarCacheTablero,
  huellaSegura,
  leerCacheTablero,
} from './tablero.repository.js'

/**
 * Arma el tablero y lo guarda en finanzasTablero (un documento por mes y moneda).
 * Si tiene menos de 30 minutos se reutiliza. Si el mes es el actual y cambió
 * un saldo, un sync, un cheque o la agenda, se vuelve a calcular antes.
 * Los movimientos del rango se leen una sola vez por cálculo.
 */
export async function obtenerTableroFinanzas(input: {
  mes: string
  moneda: MonedaTablero
  ahora?: Date
}): Promise<TableroFinanzas> {
  const ahora = input.ahora ?? new Date()
  const ahoraMs = ahora.getTime()
  const hoy = dateKeyInArgentina(ahora)
  const esMesActual = input.mes === mesDeFecha(hoy)
  const cache = await leerCacheTablero(input.mes, input.moneda)

  if (cache && cacheTableroVigente(cache, ahoraMs)) {
    if (!esMesActual) return cache.payload
    const huella = await huellaSegura(input.mes)
    if (huella == null || huella === cache.huella) return cache.payload
  }

  const datos = await cargarDatosTablero(input.mes, hoy)
  const payload = armarTablero({
    ...datos,
    mes: input.mes,
    moneda: input.moneda,
    hoy,
    generadoEn: ahora.toISOString(),
  })
  const huella = (await huellaSegura(input.mes)) ?? ''
  try {
    await guardarCacheTablero({
      mes: input.mes,
      moneda: input.moneda,
      huella,
      payload,
      ahoraMs,
    })
  } catch (err) {
    logError('[finanzas/tablero] no se pudo guardar el tablero en caché', err)
  }
  return payload
}
