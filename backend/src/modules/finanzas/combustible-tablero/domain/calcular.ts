import { sumarMeses } from '../../tablero/domain/fechas.js'
import type { CompraCombustibleRow } from '../services/combustible-tablero.repository.js'
import type {
  ComparativoAnual,
  MesGastoTablero,
  ProveedorGastoTablero,
  TableroCombustible,
  UnegocioGastoTablero,
} from './tipos.js'

const MESES_TENDENCIA = 12

export function armarTableroCombustible(input: {
  mes: string
  primerMesConDatos: string
  /** TODAS las compras desde `primerMesConDatos` hasta `mes`, incluido. */
  filas: CompraCombustibleRow[]
  unegocio: Map<number, string>
  generadoEn: string
}): TableroCombustible {
  const { mes, filas, unegocio } = input

  const filasDelMes = filas.filter((f) => f.fecha?.slice(0, 7) === mes)
  const mesAnterior = sumarMeses(mes, -1)
  const filasMesAnterior = filas.filter((f) => f.fecha?.slice(0, 7) === mesAnterior)
  const mesAnioAnterior = sumarMeses(mes, -12)
  const filasMesAnioAnterior = filas.filter((f) => f.fecha?.slice(0, 7) === mesAnioAnterior)

  const totalCentavos = filasDelMes.reduce((s, f) => s + f.totalCentavos, 0)
  const totalMesAnteriorCentavos = filasMesAnterior.reduce((s, f) => s + f.totalCentavos, 0)
  const totalMismoMesAnioAnteriorCentavos = filasMesAnioAnterior.reduce((s, f) => s + f.totalCentavos, 0)

  const variacionPorcentaje = totalMesAnteriorCentavos > 0 ? ((totalCentavos - totalMesAnteriorCentavos) / totalMesAnteriorCentavos) * 100 : null
  const variacionInteranualPorcentaje =
    totalMismoMesAnioAnteriorCentavos > 0 ? ((totalCentavos - totalMismoMesAnioAnteriorCentavos) / totalMismoMesAnioAnteriorCentavos) * 100 : null

  const cantidadComprobantes = filasDelMes.length
  const ticketPromedioCentavos = cantidadComprobantes > 0 ? Math.round(totalCentavos / cantidadComprobantes) : 0

  // --- Tendencia: últimos 12 meses (o menos, si todavía no hay tantos desde el primer mes con datos). ---
  const mesesTendencia: string[] = []
  for (let i = MESES_TENDENCIA - 1; i >= 0; i--) {
    const m = sumarMeses(mes, -i)
    if (m >= input.primerMesConDatos) mesesTendencia.push(m)
  }
  const tendencia: MesGastoTablero[] = mesesTendencia.map((m) => ({
    mes: m,
    centavos: filas.filter((f) => f.fecha?.slice(0, 7) === m).reduce((s, f) => s + f.totalCentavos, 0),
  }))

  // --- Comparativo por año calendario, desde el primer año con datos hasta el del mes elegido. ---
  const anioDesde = Number(input.primerMesConDatos.slice(0, 4))
  const anioHasta = Number(mes.slice(0, 4))
  const comparativoAnual: ComparativoAnual[] = []
  for (let anio = anioDesde; anio <= anioHasta; anio++) {
    const filasAnio = filas.filter((f) => f.fecha && Number(f.fecha.slice(0, 4)) === anio && f.fecha.slice(0, 7) <= mes)
    const mesesConDatos = new Set(filasAnio.map((f) => f.fecha!.slice(0, 7))).size
    comparativoAnual.push({ anio, centavos: filasAnio.reduce((s, f) => s + f.totalCentavos, 0), meses: mesesConDatos })
  }

  // --- Por proveedor (mes elegido). ---
  const porProveedorMap = new Map<string, { idProveedor: number | null; nombre: string; centavos: number; cantidad: number }>()
  for (const f of filasDelMes) {
    const clave = f.idProveedor !== null ? String(f.idProveedor) : 'sin-proveedor'
    const existente = porProveedorMap.get(clave)
    if (existente) {
      existente.centavos += f.totalCentavos
      existente.cantidad += 1
    } else {
      porProveedorMap.set(clave, {
        idProveedor: f.idProveedor,
        nombre: f.nombreProveedor ?? 'Proveedor sin identificar',
        centavos: f.totalCentavos,
        cantidad: 1,
      })
    }
  }
  const porProveedor: ProveedorGastoTablero[] = [...porProveedorMap.values()]
    .map((p) => ({
      idProveedor: p.idProveedor,
      nombre: p.nombre,
      centavos: p.centavos,
      cantidadComprobantes: p.cantidad,
      porcentaje: totalCentavos > 0 ? (p.centavos / totalCentavos) * 100 : null,
    }))
    .sort((a, b) => b.centavos - a.centavos)

  // --- Por unidad de negocio (mes elegido). La mayoría de las facturas no tienen unidad asignada en Vientri. ---
  const porUnegocioMap = new Map<string, { idUnegocio: number | null; nombre: string; centavos: number }>()
  for (const f of filasDelMes) {
    const clave = f.idUnegocio !== null ? String(f.idUnegocio) : 'sin-unegocio'
    const nombre = f.idUnegocio !== null ? unegocio.get(f.idUnegocio) ?? `Unidad #${f.idUnegocio}` : 'Sin unidad asignada'
    const existente = porUnegocioMap.get(clave)
    if (existente) existente.centavos += f.totalCentavos
    else porUnegocioMap.set(clave, { idUnegocio: f.idUnegocio, nombre, centavos: f.totalCentavos })
  }
  const porUnegocio: UnegocioGastoTablero[] = [...porUnegocioMap.values()]
    .map((u) => ({ ...u, porcentaje: totalCentavos > 0 ? (u.centavos / totalCentavos) * 100 : null }))
    .sort((a, b) => b.centavos - a.centavos)

  return {
    mes,
    generadoEn: input.generadoEn,
    totalCentavos,
    totalMesAnteriorCentavos,
    variacionPorcentaje,
    totalMismoMesAnioAnteriorCentavos,
    mesAnioAnterior,
    variacionInteranualPorcentaje,
    cantidadComprobantes,
    ticketPromedioCentavos,
    tendencia,
    comparativoAnual,
    porProveedor,
    porUnegocio,
    primerMesConDatos: input.primerMesConDatos,
  }
}
