import type {
  CeldaDiaMes,
  ColumnaDiaMes,
  FilaCompromisoMes,
  MontosMoneda,
} from '../../../../services/finanzasCompromisosMesApi'
import { sumarDias } from '../cajaDelDia/fechasCaja'
import { lunesDe } from '../compromisosSemana/semana'

/** Funciones puras para agrupar el mes en semanas de días hábiles. */

export interface SemanaDelMes {
  numero: number
  /** Días hábiles de esa semana que caen en el mes, en orden. */
  fechas: string[]
  desde: number
  hasta: number
  contieneHoy: boolean
}

export function etiquetaRango(desde: number, hasta: number): string {
  return desde === hasta ? String(desde) : `${desde} al ${hasta}`
}

export function textoDia(fecha: string): string {
  const nombre = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${fecha}T12:00:00Z`),
  )
  return `${nombre} ${Number(fecha.slice(8))}`
}

/** Semanas del mes, solo con días hábiles. Se marca la que contiene hoy si hoy es de este mes. */
export function semanasDelMes(
  columnas: readonly Pick<ColumnaDiaMes, 'fecha' | 'tipo'>[],
  mes: string,
  hoy: string,
): SemanaDelMes[] {
  const porLunes = new Map<string, string[]>()
  for (const columna of columnas) {
    if (columna.tipo !== 'habil') continue
    const lunes = lunesDe(columna.fecha)
    const lista = porLunes.get(lunes)
    if (lista) lista.push(columna.fecha)
    else porLunes.set(lunes, [columna.fecha])
  }

  const semanas: SemanaDelMes[] = []
  for (const [lunes, fechas] of [...porLunes.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const primera = fechas[0]
    const ultima = fechas[fechas.length - 1]
    if (!primera || !ultima) continue
    const domingo = sumarDias(lunes, 6)
    semanas.push({
      numero: semanas.length + 1,
      fechas,
      desde: Number(primera.slice(8)),
      hasta: Number(ultima.slice(8)),
      contieneHoy: hoy.slice(0, 7) === mes && hoy >= lunes && hoy <= domingo,
    })
  }
  return semanas
}

export interface SumaSemana {
  planificadoCentavos: number
  pagadoCentavos: number
  /** Algún importe previsto de la semana ya pasó de fecha. */
  vencio: boolean
}

export function sumaEnSemana(
  porDia: Record<string, CeldaDiaMes>,
  fechas: readonly string[],
  hoy: string,
): SumaSemana {
  let planificadoCentavos = 0
  let pagadoCentavos = 0
  let vencio = false
  for (const fecha of fechas) {
    const celda = porDia[fecha]
    if (!celda) continue
    planificadoCentavos += celda.planificadoCentavos
    pagadoCentavos += celda.pagadoCentavos
    if (celda.planificadoCentavos > 0 && fecha < hoy) vencio = true
  }
  return { planificadoCentavos, pagadoCentavos, vencio }
}

export type TonoMonto = 'vacio' | 'vencido' | 'pagado' | 'aPagar'

export function tonoSemana(
  suma: SumaSemana,
  fila: Pick<FilaCompromisoMes, 'diferenciaCentavos' | 'estado'>,
): TonoMonto {
  if (suma.planificadoCentavos <= 0) return 'vacio'
  if (fila.estado === 'pagado' || fila.diferenciaCentavos <= 0) return 'pagado'
  if (suma.vencio) return 'vencido'
  return 'aPagar'
}

/** Suma lo previsto de esas fechas, pesos y dólares por separado. */
export function montosPlanificados(filas: readonly FilaCompromisoMes[], fechas: readonly string[]): MontosMoneda {
  const total: MontosMoneda = { ars: 0, usd: 0 }
  for (const fila of filas) {
    let centavos = 0
    for (const fecha of fechas) centavos += fila.porDia[fecha]?.planificadoCentavos ?? 0
    if (centavos <= 0) continue
    if (fila.moneda === 'USD') total.usd += centavos
    else total.ars += centavos
  }
  return total
}
