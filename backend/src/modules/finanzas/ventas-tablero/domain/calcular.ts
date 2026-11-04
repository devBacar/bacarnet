import { esDiaHabil, sumarDiasCalendario } from '../../tablero/domain/diasHabiles.js'
import { inicioMes, mesDeFecha, ultimoDiaMes } from '../../tablero/domain/fechas.js'
import type {
  ComprobanteVentaRow,
  ItemComprobanteRow,
  TendenciaMesDetallada,
} from '../services/ventas-tablero.repository.js'
import type {
  ClientePerdidoTablero,
  ClienteVentaTablero,
  ItemVentaTablero,
  MesTendenciaTablero,
  ProyeccionVentas,
  TableroVentas,
  TendenciaUnegocioMes,
  UnegocioVentaTablero,
} from './tipos.js'

/** % de caída vs. el mes anterior a partir del cual se marca `caidaFuerte` en una unidad de negocio. */
const UMBRAL_CAIDA_FUERTE = 20

/**
 * Unidades de negocio que no se muestran en el desglose del tablero (pedido explícito: no tienen
 * actividad relevante hoy). Su facturación sigue sumando en los totales de la empresa, solo se
 * ocultan como fila/columna/serie propia en "Por unidad", el mix mensual y el mapa de calor.
 * id 5 = ALQUILER DE MÁQUINAS DE RECUENTO.
 */
const UNIDADES_OCULTAS = new Set<number>([5])

function proyectarMes(mes: string, hoy: string, totalCentavos: number): ProyeccionVentas | null {
  if (mesDeFecha(hoy) !== mes) return null
  const ultimo = ultimoDiaMes(mes)
  let totales = 0
  let transcurridos = 0
  let cursor = inicioMes(mes)
  while (cursor <= ultimo) {
    if (esDiaHabil(cursor)) {
      totales += 1
      if (cursor <= hoy) transcurridos += 1
    }
    cursor = sumarDiasCalendario(cursor, 1)
  }
  if (transcurridos === 0) return null
  return {
    totalProyectadoCentavos: Math.round((totalCentavos / transcurridos) * totales),
    diasHabilesTranscurridos: transcurridos,
    diasHabilesTotales: totales,
  }
}

export function armarTableroVentas(input: {
  mes: string
  moneda: string
  comprobantesMes: ComprobanteVentaRow[]
  itemsMes: ItemComprobanteRow[]
  /** Comprobantes completos del mes anterior (no solo el total): para variación por unidad y altas/bajas de clientes. */
  comprobantesMesAnterior: ComprobanteVentaRow[]
  totalMismoMesAnioAnteriorCentavos: number
  mesAnioAnterior: string
  unegocio: Map<number, string>
  art: Map<number, string>
  tendencia: MesTendenciaTablero[]
  tendenciaDetallada: TendenciaMesDetallada[]
  /** Desglose por unidad de negocio del mismo mes, un año atrás (para el interanual por unidad). */
  mismoMesAnioAnteriorPorUnidad: Array<{ idUnegocio: number | null; centavos: number }>
  hoy: string
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
  const cantidadComprobantesPorUnidad = new Map<string, number>()
  const clientesCentavosPorUnidad = new Map<string, Map<number, number>>()

  for (const c of comprobantesMes) {
    const idUn = c.idUnegocio
    const nombreUn = idUn !== null ? unegocio.get(idUn) ?? `Unidad #${idUn}` : 'Sin unidad de negocio'
    const claveUn = idUn !== null ? String(idUn) : 'sin-unegocio'
    let un = porUnegocioMap.get(claveUn)
    if (!un) {
      un = {
        idUnegocio: idUn,
        nombre: nombreUn,
        centavos: 0,
        porcentaje: null,
        items: [],
        centavosMesAnterior: 0,
        variacionPorcentaje: null,
        caidaFuerte: false,
        cantidadComprobantes: 0,
        cantidadClientes: 0,
        ticketPromedioCentavos: 0,
        concentracionTop5Porcentaje: null,
        centavosMismoMesAnioAnterior: 0,
        variacionInteranualPorcentaje: null,
      }
      porUnegocioMap.set(claveUn, un)
    }
    un.centavos += c.totalCentavos
    cantidadComprobantesPorUnidad.set(claveUn, (cantidadComprobantesPorUnidad.get(claveUn) ?? 0) + 1)

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

      const clientesUnidad = clientesCentavosPorUnidad.get(claveUn) ?? new Map<number, number>()
      clientesUnidad.set(c.persona.vientriId, (clientesUnidad.get(c.persona.vientriId) ?? 0) + c.totalCentavos)
      clientesCentavosPorUnidad.set(claveUn, clientesUnidad)
    }
  }

  // --- Mes anterior: totales por unidad y por cliente, para variación y altas/bajas. ---
  const porUnegocioAnteriorMap = new Map<string, number>()
  const porClienteAnteriorMap = new Map<number, { nombre: string; centavos: number; porUnegocio: Map<string, { nombre: string; centavos: number }> }>()
  for (const c of input.comprobantesMesAnterior) {
    const idUn = c.idUnegocio
    const claveUn = idUn !== null ? String(idUn) : 'sin-unegocio'
    const nombreUn = idUn !== null ? unegocio.get(idUn) ?? `Unidad #${idUn}` : 'Sin unidad de negocio'
    porUnegocioAnteriorMap.set(claveUn, (porUnegocioAnteriorMap.get(claveUn) ?? 0) + c.totalCentavos)
    if (c.persona) {
      const previo = porClienteAnteriorMap.get(c.persona.vientriId)
      const nombre = c.persona.nombre ?? `Cliente #${c.persona.vientriId}`
      const porUnegocioCli = previo?.porUnegocio ?? new Map<string, { nombre: string; centavos: number }>()
      const previoUn = porUnegocioCli.get(claveUn)
      porUnegocioCli.set(claveUn, { nombre: nombreUn, centavos: (previoUn?.centavos ?? 0) + c.totalCentavos })
      porClienteAnteriorMap.set(c.persona.vientriId, { nombre, centavos: (previo?.centavos ?? 0) + c.totalCentavos, porUnegocio: porUnegocioCli })
    }
  }

  const mismoMesAnioAnteriorPorUnidadMap = new Map<string, number>()
  for (const u of input.mismoMesAnioAnteriorPorUnidad) {
    const clave = u.idUnegocio !== null ? String(u.idUnegocio) : 'sin-unegocio'
    mismoMesAnioAnteriorPorUnidadMap.set(clave, (mismoMesAnioAnteriorPorUnidadMap.get(clave) ?? 0) + u.centavos)
  }

  const porUnegocio = [...porUnegocioMap.entries()]
    .map(([clave, u]) => {
      const centavosMesAnterior = porUnegocioAnteriorMap.get(clave) ?? 0
      const variacionPorcentaje = centavosMesAnterior > 0 ? ((u.centavos - centavosMesAnterior) / centavosMesAnterior) * 100 : null
      const cantidadComprobantesUnidad = cantidadComprobantesPorUnidad.get(clave) ?? 0
      const clientesUnidad = clientesCentavosPorUnidad.get(clave)
      const cantidadClientesUnidad = clientesUnidad?.size ?? 0
      const top5CentavosUnidad = clientesUnidad ? [...clientesUnidad.values()].sort((a, b) => b - a).slice(0, 5).reduce((s, v) => s + v, 0) : 0
      const centavosMismoMesAnioAnterior = mismoMesAnioAnteriorPorUnidadMap.get(clave) ?? 0
      const variacionInteranualPorcentaje =
        centavosMismoMesAnioAnterior > 0 ? ((u.centavos - centavosMismoMesAnioAnterior) / centavosMismoMesAnioAnterior) * 100 : null
      return {
        ...u,
        porcentaje: totalCentavos > 0 ? (u.centavos / totalCentavos) * 100 : null,
        items: u.items.sort((a, b) => b.centavos - a.centavos),
        centavosMesAnterior,
        variacionPorcentaje,
        caidaFuerte: variacionPorcentaje !== null && variacionPorcentaje <= -UMBRAL_CAIDA_FUERTE,
        cantidadComprobantes: cantidadComprobantesUnidad,
        cantidadClientes: cantidadClientesUnidad,
        ticketPromedioCentavos: cantidadComprobantesUnidad > 0 ? Math.round(u.centavos / cantidadComprobantesUnidad) : 0,
        concentracionTop5Porcentaje: u.centavos > 0 && clientesUnidad ? (top5CentavosUnidad / u.centavos) * 100 : null,
        centavosMismoMesAnioAnterior,
        variacionInteranualPorcentaje,
      }
    })
    .filter((u) => u.idUnegocio === null || !UNIDADES_OCULTAS.has(u.idUnegocio))
    .sort((a, b) => b.centavos - a.centavos)

  const clientes = [...porClienteMap.values()].sort((a, b) => b.centavos - a.centavos)

  const clientesNuevos = clientes.filter((c) => !porClienteAnteriorMap.has(c.vientriId)).slice(0, 10)
  const clientesPerdidos: ClientePerdidoTablero[] = [...porClienteAnteriorMap.entries()]
    .filter(([vientriId]) => !porClienteMap.has(vientriId))
    .map(([vientriId, v]) => ({
      vientriId,
      nombre: v.nombre,
      centavosMesAnterior: v.centavos,
      porUnegocio: [...v.porUnegocio.entries()].map(([clave, pu]) => ({
        idUnegocio: clave === 'sin-unegocio' ? null : Number(clave),
        nombre: pu.nombre,
        centavosMesAnterior: pu.centavos,
      })),
    }))
    .sort((a, b) => b.centavosMesAnterior - a.centavosMesAnterior)
    .slice(0, 10)

  const totalMesAnteriorCentavos = input.comprobantesMesAnterior.reduce((acc, c) => acc + c.totalCentavos, 0)
  const variacionPorcentaje = totalMesAnteriorCentavos > 0 ? ((totalCentavos - totalMesAnteriorCentavos) / totalMesAnteriorCentavos) * 100 : null

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

  const tendenciaPorUnegocio: TendenciaUnegocioMes[] = input.tendenciaDetallada.map((t) => ({
    mes: t.mes,
    porUnegocio: t.porUnegocio
      .filter((u) => u.idUnegocio === null || !UNIDADES_OCULTAS.has(u.idUnegocio))
      .map((u) => ({
        idUnegocio: u.idUnegocio,
        nombre: u.idUnegocio !== null ? unegocio.get(u.idUnegocio) ?? `Unidad #${u.idUnegocio}` : 'Sin unidad de negocio',
        centavos: u.centavos,
      }))
      .sort((a, b) => b.centavos - a.centavos),
  }))

  const variacionInteranual =
    input.totalMismoMesAnioAnteriorCentavos > 0
      ? ((totalCentavos - input.totalMismoMesAnioAnteriorCentavos) / input.totalMismoMesAnioAnteriorCentavos) * 100
      : null

  return {
    mes: input.mes,
    moneda: input.moneda,
    generadoEn: input.generadoEn,
    totalCentavos,
    totalMesAnteriorCentavos,
    variacionPorcentaje,
    cantidadComprobantes,
    cantidadClientes,
    ticketPromedioCentavos,
    concentracionTop5Porcentaje,
    tendencia: input.tendencia,
    tendenciaPorUnegocio,
    comparativoInteranual: {
      mesAnioAnterior: input.mesAnioAnterior,
      totalCentavos: input.totalMismoMesAnioAnteriorCentavos,
      variacionPorcentaje: variacionInteranual,
    },
    proyeccion: proyectarMes(input.mes, input.hoy, totalCentavos),
    porUnegocio,
    topItems,
    clientes,
    clientesNuevos,
    clientesPerdidos,
    sinDatosDeItems: input.sinDatosDeItems,
  }
}
