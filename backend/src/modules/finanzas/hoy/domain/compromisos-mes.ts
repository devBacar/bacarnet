import {
  normalizarCentavosOpcional,
  normalizarCuota,
  normalizarGrupo,
  normalizarMoneda,
  normalizarObservacion,
  textoCuota,
} from '../../agenda/domain/compromiso-campos.js'
import {
  acumuladoDePagos,
  pagadoLegacyCompleto,
  type PagoRegistradoVista,
} from '../../agenda/domain/pago-compromiso.js'
import type { MedioPago, MonedaCompromiso } from '../../agenda/domain/agenda.types.js'
import { GRUPOS_COMPROMISO } from '../../agenda/domain/grupos-compromiso.js'

export type TipoColumnaDia = 'habil' | 'finde' | 'feriado'

export interface ColumnaDia {
  fecha: string
  tipo: TipoColumnaDia
  esHoy: boolean
  /** Días de calendario que entran en la columna. El finde junta sábado y domingo. */
  fechas: string[]
}

export interface CeldaDia {
  planificadoCentavos: number
  pagadoCentavos: number
  /** El vencimiento cayó en finde o feriado y se corrió al hábil anterior. */
  corrido: boolean
}

export interface MontosMoneda {
  ars: number
  usd: number
}

export interface CompromisoParaPlanilla {
  id: string
  concepto: string
  proveedorONombre: string
  montoCentavos: number
  fechaVencimiento: string
  fechaPago: string | null
  estado: string
  medioPago: MedioPago
  grupo: string
  moneda: MonedaCompromiso
  deudaTotalCentavos: number | null
  cuotaNumero: number | null
  cuotaTotal: number | null
  observacion: string | null
  pagos: PagoRegistradoVista[]
  /** Monto reservado en transferencias que todavía no se firmaron. */
  enFirmaCentavos?: number
}

export interface FilaPlanilla {
  compromisoId: string
  concepto: string
  proveedorONombre: string
  moneda: MonedaCompromiso
  deudaTotalCentavos: number | null
  importeCentavos: number
  cuota: string | null
  cuotaNumero: number | null
  cuotaTotal: number | null
  observacion: string | null
  fechaVencimiento: string
  medioPago: MedioPago
  porDia: Record<string, CeldaDia>
  acumuladoCentavos: number
  diferenciaCentavos: number
  enFirmaCentavos: number
  estado: string
}

export interface GrupoPlanilla {
  grupo: string
  filas: FilaPlanilla[]
  subtotalPorDia: Record<string, MontosMoneda>
  subtotal: {
    importe: MontosMoneda
    acumulado: MontosMoneda
    diferencia: MontosMoneda
  }
}

export interface PlanillaMes {
  mes: string
  tipoCambio: number | null
  dias: ColumnaDia[]
  grupos: GrupoPlanilla[]
  totalEgresosPorDia: Record<string, MontosMoneda & { arsConvertido: number }>
}

export function parseMes(value: string): { anio: number; mes: number } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value)
  if (!match) return null
  return { anio: Number(match[1]), mes: Number(match[2]) }
}

export function sumarDiasCalendario(iso: string, dias: number): string {
  const [anio, mes, dia] = iso.split('-').map((parte) => Number(parte))
  const date = new Date(Date.UTC(anio, mes - 1, dia))
  date.setUTCDate(date.getUTCDate() + dias)
  return date.toISOString().slice(0, 10)
}

export function diasDelMes(mes: string): string[] {
  const parsed = parseMes(mes)
  if (!parsed) return []
  const cantidad = new Date(Date.UTC(parsed.anio, parsed.mes, 0)).getUTCDate()
  const dias: string[] = []
  for (let dia = 1; dia <= cantidad; dia += 1) {
    dias.push(`${mes}-${String(dia).padStart(2, '0')}`)
  }
  return dias
}

/** Sábado y domingo son finde aunque coincidan con un feriado (queda en esa columna). */
export function clasificarDia(iso: string, feriados: ReadonlySet<string>): TipoColumnaDia {
  const [anio, mes, dia] = iso.split('-').map((parte) => Number(parte))
  const dow = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()
  if (dow === 0 || dow === 6) return 'finde'
  if (feriados.has(iso)) return 'feriado'
  return 'habil'
}

export function armarColumnasMes(mes: string, hoy: string, feriados: ReadonlySet<string>): ColumnaDia[] {
  const columnas: ColumnaDia[] = []
  for (const fecha of diasDelMes(mes)) {
    const tipo = clasificarDia(fecha, feriados)
    const previa = columnas[columnas.length - 1]
    if (tipo === 'finde' && previa?.tipo === 'finde') {
      previa.fechas.push(fecha)
      if (fecha === hoy) previa.esHoy = true
      continue
    }
    columnas.push({ fecha, tipo, esHoy: fecha === hoy, fechas: [fecha] })
  }
  return columnas
}

export function arsConvertido(ars: number, usd: number, tipoCambio: number | null): number {
  if (tipoCambio == null) return ars
  return ars + Math.round(usd * tipoCambio)
}

/**
 * El importe se anota en la fecha de vencimiento.
 * Si cae en finde o feriado, pasa al hábil anterior y queda marcado.
 * Si ese hábil es del mes previo, se anota en el primer hábil del mes.
 */
export function ubicarPlanificado(
  fechaVencimiento: string,
  columnas: readonly ColumnaDia[],
  feriados: ReadonlySet<string>,
): { fecha: string; corrido: boolean } | null {
  const columnaPorFecha = indexarColumnas(columnas)
  if (!columnaPorFecha.has(fechaVencimiento)) return null
  const propia = columnas.find((columna) => columna.fechas.includes(fechaVencimiento))
  if (!propia) return null
  if (propia.tipo === 'habil') return { fecha: propia.fecha, corrido: false }

  let cursor = sumarDiasCalendario(fechaVencimiento, -1)
  for (let i = 0; i < 21; i += 1) {
    if (clasificarDia(cursor, feriados) === 'habil') {
      const destino = columnaPorFecha.get(cursor)
      if (destino) return { fecha: destino, corrido: true }
      const primero = columnas.find((columna) => columna.tipo === 'habil')
      return primero ? { fecha: primero.fecha, corrido: true } : null
    }
    cursor = sumarDiasCalendario(cursor, -1)
  }
  return null
}

function indexarColumnas(columnas: readonly ColumnaDia[]): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const columna of columnas) {
    for (const fecha of columna.fechas) mapa.set(fecha, columna.fecha)
  }
  return mapa
}

function vacioMoneda(): MontosMoneda {
  return { ars: 0, usd: 0 }
}

function sumarMoneda(destino: MontosMoneda, moneda: MonedaCompromiso, centavos: number) {
  if (moneda === 'USD') destino.usd += centavos
  else destino.ars += centavos
}

function pagosDelCompromiso(row: CompromisoParaPlanilla): Array<{ fecha: string; montoCentavos: number }> {
  if (pagadoLegacyCompleto({ estado: row.estado, pagos: row.pagos })) {
    return [{ fecha: row.fechaPago ?? row.fechaVencimiento, montoCentavos: row.montoCentavos }]
  }
  return row.pagos.map((pago) => ({ fecha: pago.fecha, montoCentavos: pago.montoCentavos }))
}

function filaDe(
  row: CompromisoParaPlanilla,
  columnas: readonly ColumnaDia[],
  feriados: ReadonlySet<string>,
): FilaPlanilla {
  const pagos = pagosDelCompromiso(row)
  const acumuladoCentavos = pagadoLegacyCompleto(row)
    ? row.montoCentavos
    : acumuladoDePagos(row.pagos)
  const diferenciaCentavos = Math.max(0, row.montoCentavos - acumuladoCentavos)
  const porDia: Record<string, CeldaDia> = {}
  const columnaPorFecha = indexarColumnas(columnas)

  const celda = (fecha: string): CeldaDia => {
    const actual = porDia[fecha]
    if (actual) return actual
    const nueva: CeldaDia = { planificadoCentavos: 0, pagadoCentavos: 0, corrido: false }
    porDia[fecha] = nueva
    return nueva
  }

  const ubicacion = ubicarPlanificado(row.fechaVencimiento, columnas, feriados)
  if (ubicacion) {
    const destino = celda(ubicacion.fecha)
    destino.planificadoCentavos += row.montoCentavos
    destino.corrido = ubicacion.corrido
  }
  for (const pago of pagos) {
    const fechaColumna = columnaPorFecha.get(pago.fecha)
    if (!fechaColumna) continue
    celda(fechaColumna).pagadoCentavos += pago.montoCentavos
  }

  const cuota = normalizarCuota(row.cuotaNumero, row.cuotaTotal)
  const completo = pagadoLegacyCompleto(row) || acumuladoCentavos >= row.montoCentavos
  return {
    compromisoId: row.id,
    concepto: row.concepto,
    proveedorONombre: row.proveedorONombre,
    moneda: normalizarMoneda(row.moneda),
    deudaTotalCentavos: normalizarCentavosOpcional(row.deudaTotalCentavos),
    importeCentavos: row.montoCentavos,
    cuota: textoCuota(cuota.cuotaNumero, cuota.cuotaTotal),
    cuotaNumero: cuota.cuotaNumero,
    cuotaTotal: cuota.cuotaTotal,
    observacion: normalizarObservacion(row.observacion),
    fechaVencimiento: row.fechaVencimiento,
    medioPago: row.medioPago,
    porDia,
    acumuladoCentavos,
    diferenciaCentavos,
    enFirmaCentavos:
      row.estado === 'confeccionada_pendiente_autorizacion'
        ? diferenciaCentavos
        : Math.min(diferenciaCentavos, Math.max(0, row.enFirmaCentavos ?? 0)),
    estado: completo ? 'pagado' : row.estado,
  }
}

function entraEnMes(row: CompromisoParaPlanilla, mes: string): boolean {
  if (row.fechaVencimiento.startsWith(mes)) return true
  if (row.pagos.some((pago) => pago.fecha.startsWith(mes))) return true
  if (pagadoLegacyCompleto(row) && (row.fechaPago ?? row.fechaVencimiento).startsWith(mes)) return true
  return false
}

/**
 * Acumulado y diferencia miran todo lo pagado del compromiso (así cierra en cero).
 * Las celdas y el total de egresos del día solo suman lo que cae en este mes.
 */
export function armarPlanillaMes(input: {
  mes: string
  hoy: string
  tipoCambio: number | null
  feriados: ReadonlySet<string>
  compromisos: readonly CompromisoParaPlanilla[]
}): PlanillaMes {
  const columnas = armarColumnasMes(input.mes, input.hoy, input.feriados)
  const grupos = new Map<string, FilaPlanilla[]>()
  for (const grupo of GRUPOS_COMPROMISO) grupos.set(grupo, [])

  const filas = input.compromisos
    .filter((row) => entraEnMes(row, input.mes))
    .map((row) => ({ grupo: normalizarGrupo(row.grupo), fila: filaDe(row, columnas, input.feriados) }))
    .sort((a, b) => {
      const porFecha = a.fila.fechaVencimiento.localeCompare(b.fila.fechaVencimiento)
      if (porFecha !== 0) return porFecha
      return a.fila.concepto.localeCompare(b.fila.concepto, 'es')
    })

  for (const item of filas) {
    const lista = grupos.get(item.grupo) ?? grupos.get('Otros egresos')
    lista?.push(item.fila)
  }

  const totalEgresosPorDia: PlanillaMes['totalEgresosPorDia'] = {}
  const gruposArmados: GrupoPlanilla[] = []

  for (const grupo of GRUPOS_COMPROMISO) {
    const filasGrupo = grupos.get(grupo) ?? []
    const subtotalPorDia: Record<string, MontosMoneda> = {}
    const subtotal = {
      importe: vacioMoneda(),
      acumulado: vacioMoneda(),
      diferencia: vacioMoneda(),
    }
    for (const fila of filasGrupo) {
      sumarMoneda(subtotal.importe, fila.moneda, fila.importeCentavos)
      sumarMoneda(subtotal.acumulado, fila.moneda, fila.acumuladoCentavos)
      sumarMoneda(subtotal.diferencia, fila.moneda, fila.diferenciaCentavos)
      for (const [fecha, celdaDia] of Object.entries(fila.porDia)) {
        if (celdaDia.pagadoCentavos <= 0) continue
        const bucket = subtotalPorDia[fecha] ?? (subtotalPorDia[fecha] = vacioMoneda())
        sumarMoneda(bucket, fila.moneda, celdaDia.pagadoCentavos)
        const total = totalEgresosPorDia[fecha] ?? {
          ars: 0,
          usd: 0,
          arsConvertido: 0,
        }
        if (fila.moneda === 'USD') total.usd += celdaDia.pagadoCentavos
        else total.ars += celdaDia.pagadoCentavos
        total.arsConvertido = arsConvertido(total.ars, total.usd, input.tipoCambio)
        totalEgresosPorDia[fecha] = total
      }
    }
    gruposArmados.push({ grupo, filas: filasGrupo, subtotalPorDia, subtotal })
  }

  return {
    mes: input.mes,
    tipoCambio: input.tipoCambio,
    dias: columnas,
    grupos: gruposArmados,
    totalEgresosPorDia,
  }
}
