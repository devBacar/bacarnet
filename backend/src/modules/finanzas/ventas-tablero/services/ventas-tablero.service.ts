import { sumarMeses } from '../../tablero/domain/fechas.js'
import { armarTableroVentas } from '../domain/calcular.js'
import type { TableroVentas } from '../domain/tipos.js'
import { cargarDatosVentasMes, cargarTotalMes, hayItemsImportados } from './ventas-tablero.repository.js'

const MESES_TENDENCIA = 6

/** Cache simple en memoria (se pierde en cada deploy/restart). Dataset chico y de bajo tráfico: alcanza. */
const CACHE = new Map<string, { hasta: number; payload: TableroVentas }>()
const CACHE_MINUTOS = 15

export async function obtenerTableroVentas(input: { mes: string; moneda: string }): Promise<TableroVentas> {
  const clave = `${input.mes}-${input.moneda}`
  const cache = CACHE.get(clave)
  if (cache && cache.hasta > Date.now()) return cache.payload

  const mesesTendencia: string[] = []
  for (let i = MESES_TENDENCIA - 1; i >= 0; i--) mesesTendencia.push(sumarMeses(input.mes, -i))

  const [datosMes, datosMesAnterior, sinItems, totalesTendencia] = await Promise.all([
    cargarDatosVentasMes(input.mes),
    cargarDatosVentasMes(sumarMeses(input.mes, -1)),
    hayItemsImportados().then((hay) => !hay),
    Promise.all(mesesTendencia.map((mes) => cargarTotalMes(mes))),
  ])

  const totalMesAnteriorCentavos = datosMesAnterior.comprobantes.reduce((acc, c) => acc + c.totalCentavos, 0)
  const tendencia = mesesTendencia.map((mes, i) => ({ mes, totalCentavos: totalesTendencia[i] }))

  const payload = armarTableroVentas({
    mes: input.mes,
    moneda: input.moneda,
    comprobantesMes: datosMes.comprobantes,
    itemsMes: datosMes.items,
    comprobantesMesAnteriorTotalCentavos: totalMesAnteriorCentavos,
    unegocio: datosMes.unegocio,
    art: datosMes.art,
    tendencia,
    sinDatosDeItems: sinItems,
    generadoEn: new Date().toISOString(),
  })

  CACHE.set(clave, { hasta: Date.now() + CACHE_MINUTOS * 60_000, payload })
  return payload
}
