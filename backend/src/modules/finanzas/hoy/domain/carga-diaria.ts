import {
  arsConvertido,
  clasificarDia,
  sumarDiasCalendario,
  ubicarPlanificado,
  armarColumnasMes,
  type ColumnaDia,
  type CompromisoParaPlanilla,
  type TipoColumnaDia,
} from './compromisos-mes.js'
import { acumuladoDePagos, pagadoLegacyCompleto } from '../../agenda/domain/pago-compromiso.js'

/**
 * Qué tan cargado está un día de pagos, comparado con el promedio de los días hábiles de su mes.
 * - liviano: hasta el 60 % del promedio
 * - medio: entre el 60 % y el 140 % del promedio
 * - pesado: más del 140 % del promedio
 */
export const UMBRAL_LIVIANO = 0.6
export const UMBRAL_PESADO = 1.4

export type NivelCarga = 'liviano' | 'medio' | 'pesado' | 'sin_pagos'

export interface DiaCarga {
  fecha: string
  tipo: TipoColumnaDia
  esHoy: boolean
  /** Todo lo que vence ese día (en pesos; los dólares se pasan con el tipo de cambio del mes). */
  totalCentavos: number
  /** Lo que de eso todavía no se pagó. */
  pendienteCentavos: number
  cantidad: number
  /** Nivel contra el promedio del mes. Finde y feriado no tienen nivel: los vencimientos se corren al hábil anterior. */
  nivel: NivelCarga
  /** Cuánto del promedio del mes representa este día (1 = igual al promedio). */
  vsPromedio: number | null
}

export interface CargaMes {
  mes: string
  promedioCentavos: number
  diasHabiles: number
  totalCentavos: number
}

export interface CargaDiaria {
  desde: string
  hasta: string
  tipoCambio: number | null
  dias: DiaCarga[]
  meses: CargaMes[]
  /** Vencido antes de "desde" que sigue sin pagar. No entra en ningún día. */
  arrastreCentavos: number
  /** Todos los días hábiles del tramo ordenados de menor a mayor carga. */
  diasMasLivianos: string[]
}

export function nivelDeCarga(totalCentavos: number, promedioCentavos: number): NivelCarga {
  if (totalCentavos <= 0) return 'sin_pagos'
  if (promedioCentavos <= 0) return 'pesado'
  const razon = totalCentavos / promedioCentavos
  if (razon <= UMBRAL_LIVIANO) return 'liviano'
  if (razon > UMBRAL_PESADO) return 'pesado'
  return 'medio'
}

function pendienteDe(row: CompromisoParaPlanilla): number {
  if (pagadoLegacyCompleto(row)) return 0
  return Math.max(0, row.montoCentavos - acumuladoDePagos(row.pagos))
}

function enPesos(row: CompromisoParaPlanilla, centavos: number, tipoCambio: number | null): number {
  return row.moneda === 'USD' ? arsConvertido(0, centavos, tipoCambio) : centavos
}

function mesDe(fecha: string): string {
  return fecha.slice(0, 7)
}

function diasEntre(desde: string, hasta: string): string[] {
  const lista: string[] = []
  for (let cursor = desde; cursor <= hasta; cursor = sumarDiasCalendario(cursor, 1)) lista.push(cursor)
  return lista
}

function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = []
  for (const fecha of diasEntre(desde, hasta)) {
    const mes = mesDe(fecha)
    if (meses[meses.length - 1] !== mes) meses.push(mes)
  }
  return meses
}

/**
 * Arma la carga de cada día entre `desde` y `desde + dias - 1`.
 * El promedio de cada mes usa los días hábiles del mes entero (también los que ya pasaron),
 * así un mismo día no cambia de nivel a medida que se va pagando.
 * Los vencimientos de finde o feriado se corren al hábil anterior, igual que en "Compromisos de la semana".
 */
export function armarCargaDiaria(input: {
  desde: string
  dias: number
  hoy: string
  tipoCambio: number | null
  feriados: ReadonlySet<string>
  compromisos: readonly CompromisoParaPlanilla[]
}): CargaDiaria {
  const hasta = sumarDiasCalendario(input.desde, Math.max(1, input.dias) - 1)
  // Para el promedio hace falta el mes completo de cada punta del tramo.
  const meses = mesesEntre(input.desde, hasta)
  const columnasPorMes = new Map<string, ColumnaDia[]>()
  for (const mes of meses) columnasPorMes.set(mes, armarColumnasMes(mes, input.hoy, input.feriados))

  const totales = new Map<string, { total: number; pendiente: number; cantidad: number }>()
  let arrastre = 0

  for (const row of input.compromisos) {
    if (row.montoCentavos <= 0) continue
    const mes = mesDe(row.fechaVencimiento)
    const columnas = columnasPorMes.get(mes)
    if (!columnas) {
      if (row.fechaVencimiento < input.desde) arrastre += enPesos(row, pendienteDe(row), input.tipoCambio)
      continue
    }
    const ubicacion = ubicarPlanificado(row.fechaVencimiento, columnas, input.feriados)
    if (!ubicacion) continue
    const acumulado = totales.get(ubicacion.fecha) ?? { total: 0, pendiente: 0, cantidad: 0 }
    acumulado.total += enPesos(row, row.montoCentavos, input.tipoCambio)
    acumulado.pendiente += enPesos(row, pendienteDe(row), input.tipoCambio)
    acumulado.cantidad += 1
    totales.set(ubicacion.fecha, acumulado)
    if (ubicacion.fecha < input.desde) arrastre += enPesos(row, pendienteDe(row), input.tipoCambio)
  }

  const resumenMeses: CargaMes[] = meses.map((mes) => {
    const columnas = columnasPorMes.get(mes) ?? []
    const habiles = columnas.filter((columna) => columna.tipo === 'habil')
    const total = habiles.reduce((suma, columna) => suma + (totales.get(columna.fecha)?.total ?? 0), 0)
    return {
      mes,
      diasHabiles: habiles.length,
      totalCentavos: total,
      promedioCentavos: habiles.length > 0 ? Math.round(total / habiles.length) : 0,
    }
  })
  const promedioPorMes = new Map(resumenMeses.map((mes) => [mes.mes, mes.promedioCentavos]))

  const dias: DiaCarga[] = diasEntre(input.desde, hasta).map((fecha) => {
    const tipo = clasificarDia(fecha, input.feriados)
    const dato = totales.get(fecha)
    const promedio = promedioPorMes.get(mesDe(fecha)) ?? 0
    const total = tipo === 'habil' ? (dato?.total ?? 0) : 0
    return {
      fecha,
      tipo,
      esHoy: fecha === input.hoy,
      totalCentavos: total,
      pendienteCentavos: tipo === 'habil' ? (dato?.pendiente ?? 0) : 0,
      cantidad: tipo === 'habil' ? (dato?.cantidad ?? 0) : 0,
      nivel: tipo === 'habil' ? nivelDeCarga(total, promedio) : 'sin_pagos',
      vsPromedio: tipo === 'habil' && promedio > 0 ? Math.round((total / promedio) * 100) / 100 : null,
    }
  })

  const diasMasLivianos = dias
    .filter((dia) => dia.tipo === 'habil' && dia.fecha >= input.hoy)
    .sort((a, b) => a.totalCentavos - b.totalCentavos || a.fecha.localeCompare(b.fecha))
    .map((dia) => dia.fecha)

  return {
    desde: input.desde,
    hasta,
    tipoCambio: input.tipoCambio,
    dias,
    meses: resumenMeses,
    arrastreCentavos: arrastre,
    diasMasLivianos,
  }
}
