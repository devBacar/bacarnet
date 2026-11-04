import { dateKeyInArgentina } from '../../agenda/domain/vencimiento.alert.js'
import { sumarMeses } from '../../tablero/domain/fechas.js'
import { armarTableroVentas } from '../domain/calcular.js'
import type { TableroVentas } from '../domain/tipos.js'
import { cargarDatosVentasMes, cargarTendenciaRango, cargarTotalMes, hayItemsImportados } from './ventas-tablero.repository.js'

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
  const mesAnioAnterior = sumarMeses(input.mes, -12)

  const [datosMes, datosMesAnterior, sinItems, tendenciaDetallada, totalMismoMesAnioAnteriorCentavos] = await Promise.all([
    cargarDatosVentasMes(input.mes, input.moneda),
    cargarDatosVentasMes(sumarMeses(input.mes, -1), input.moneda),
    hayItemsImportados().then((hay) => !hay),
    cargarTendenciaRango(mesesTendencia, input.moneda),
    cargarTotalMes(mesAnioAnterior, input.moneda),
  ])

  const tendencia = tendenciaDetallada.map((t) => ({ mes: t.mes, totalCentavos: t.totalCentavos }))

  const payload = armarTableroVentas({
    mes: input.mes,
    moneda: input.moneda,
    comprobantesMes: datosMes.comprobantes,
    itemsMes: datosMes.items,
    comprobantesMesAnterior: datosMesAnterior.comprobantes,
    totalMismoMesAnioAnteriorCentavos,
    mesAnioAnterior,
    unegocio: datosMes.unegocio,
    art: datosMes.art,
    tendencia,
    tendenciaDetallada,
    hoy: dateKeyInArgentina(new Date()),
    sinDatosDeItems: sinItems,
    generadoEn: new Date().toISOString(),
  })

  CACHE.set(clave, { hasta: Date.now() + CACHE_MINUTOS * 60_000, payload })
  return payload
}
