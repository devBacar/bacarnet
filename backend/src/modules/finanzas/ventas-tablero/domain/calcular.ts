import type {
  ComprobanteVentaRow,
  ItemComprobanteRow,
} from '../services/ventas-tablero.repository.js'
import type { ClienteVentaTablero, ItemVentaTablero, MesTendenciaTablero, TableroVentas, UnegocioVentaTablero } from './tipos.js'

export function armarTableroVentas(input: {
  mes: string
  moneda: string
  comprobantesMes: ComprobanteVentaRow[]
  itemsMes: ItemComprobanteRow[]
  comprobantesMesAnteriorTotalCentavos: number
  unegocio: Map<number, string>
  art: Map<number, string>
  tendencia: MesTendenciaTablero[]
  sinDatosDeItems: boolean
  generadoEn: string
}): TableroVentas {
  const { comprobantesMes, itemsMes, unegocio, art } = input
  const itemsPorCmp = new Map<number, ItemComprobanteRow[]>()
  for (const it of itemsMes) {
    const lista = itemsPorCmp.get(it.idCmp) ?? []
    lista.push(it)
    itemsPorCmp.set(it.idCmp, lista)
  }

  const totalCentavos = comprobantesMes.reduce((acc, c) => acc + c.totalCentavos, 0)

  const porUnegocioMap = new Map<string, UnegocioVentaTablero>()
  const porClienteMap = new Map<number, ClienteVentaTablero>()

  for (const c of comprobantesMes) {
    const idUn = c.idUnegocio
    const nombreUn = idUn !== null ? unegocio.get(idUn) ?? `Unidad #${idUn}` : 'Sin unidad de negocio'
    const claveUn = idUn !== null ? String(idUn) : 'sin-unegocio'
    let un = porUnegocioMap.get(claveUn)
    if (!un) {
      un = { idUnegocio: idUn, nombre: nombreUn, centavos: 0, porcentaje: null, items: [] }
      porUnegocioMap.set(claveUn, un)
    }
    un.centavos += c.totalCentavos

    const itemsDelCmp = itemsPorCmp.get(c.id) ?? []
    for (const it of itemsDelCmp) {
      const nombreItem = it.idArt !== null ? art.get(it.idArt) ?? `Ítem #${it.idArt}` : 'Ítem sin identificar'
      const existente = un.items.find((x) => x.idArt === it.idArt)
      if (existente) existente.centavos += it.importeCentavos
      else un.items.push({ idArt: it.idArt, nombre: nombreItem, centavos: it.importeCentavos })
    }

    if (c.persona) {
      let cli = porClienteMap.get(c.persona.vientriId)
      if (!cli) {
        cli = { vientriId: c.persona.vientriId, nombre: c.persona.nombre ?? `Cliente #${c.persona.vientriId}`, centavos: 0, porUnegocio: [] }
        porClienteMap.set(c.persona.vientriId, cli)
      }
      cli.centavos += c.totalCentavos
      const existenteUn = cli.porUnegocio.find((x) => x.idUnegocio === idUn)
      if (existenteUn) existenteUn.centavos += c.totalCentavos
      else cli.porUnegocio.push({ idUnegocio: idUn, nombre: nombreUn, centavos: c.totalCentavos })
    }
  }

  const porUnegocio = [...porUnegocioMap.values()]
    .map((u) => ({ ...u, porcentaje: totalCentavos > 0 ? (u.centavos / totalCentavos) * 100 : null, items: u.items.sort((a, b) => b.centavos - a.centavos) }))
    .sort((a, b) => b.centavos - a.centavos)

  const clientes = [...porClienteMap.values()].sort((a, b) => b.centavos - a.centavos)

  const variacionPorcentaje =
    input.comprobantesMesAnteriorTotalCentavos > 0 ? ((totalCentavos - input.comprobantesMesAnteriorTotalCentavos) / input.comprobantesMesAnteriorTotalCentavos) * 100 : null

  const cantidadComprobantes = comprobantesMes.length
  const cantidadClientes = porClienteMap.size
  const ticketPromedioCentavos = cantidadComprobantes > 0 ? Math.round(totalCentavos / cantidadComprobantes) : 0

  const top5Centavos = clientes.slice(0, 5).reduce((acc, c) => acc + c.centavos, 0)
  const concentracionTop5Porcentaje = totalCentavos > 0 ? (top5Centavos / totalCentavos) * 100 : null

  const topItemsMap = new Map<string, ItemVentaTablero>()
  for (const it of itemsMes) {
    const clave = it.idArt !== null ? String(it.idArt) : 'sin-art'
    const nombre = it.idArt !== null ? art.get(it.idArt) ?? `Ítem #${it.idArt}` : 'Ítem sin identificar'
    const existente = topItemsMap.get(clave)
    if (existente) existente.centavos += it.importeCentavos
    else topItemsMap.set(clave, { idArt: it.idArt, nombre, centavos: it.importeCentavos })
  }
  const topItems = [...topItemsMap.values()].sort((a, b) => b.centavos - a.centavos).slice(0, 8)

  return {
    mes: input.mes,
    moneda: input.moneda,
    generadoEn: input.generadoEn,
    totalCentavos,
    totalMesAnteriorCentavos: input.comprobantesMesAnteriorTotalCentavos,
    variacionPorcentaje,
    cantidadComprobantes,
    cantidadClientes,
    ticketPromedioCentavos,
    concentracionTop5Porcentaje,
    tendencia: input.tendencia,
    porUnegocio,
    topItems,
    clientes,
    sinDatosDeItems: input.sinDatosDeItems,
  }
}
