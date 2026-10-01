import type {
  FilaCompromisoMes,
  MonedaCompromiso,
  MontosMoneda,
  PlanillaCompromisosMes,
} from '../../../../services/finanzasCompromisosMesApi'
import { sumarDias } from '../cajaDelDia/fechasCaja'

/** Funciones puras de la semana de compromisos: fechas, unión de meses y subtotales. */

export function lunesDe(fecha: string): string {
  const [year, month, day] = fecha.split('-').map(Number)
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return sumarDias(fecha, -(dow === 0 ? 6 : dow - 1))
}

/** Lunes a viernes de la semana que arranca en `lunes`. */
export function diasDeLaSemana(lunes: string): string[] {
  return [0, 1, 2, 3, 4].map((i) => sumarDias(lunes, i))
}

/** Meses (YYYY-MM) que toca la semana: uno, o dos si cruza de mes. */
export function mesesDe(dias: string[]): string[] {
  return [...new Set(dias.map((dia) => dia.slice(0, 7)))]
}

/** "del 28 de septiembre al 2 de octubre" / "del 5 al 9 de octubre". */
export function rangoSemana(dias: string[]): string {
  const primero = dias[0]
  const ultimo = dias[dias.length - 1]
  if (!primero || !ultimo) return ''
  const mes = (ymd: string) => new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`))
  const dia = (ymd: string) => Number(ymd.slice(8))
  if (primero.slice(0, 7) === ultimo.slice(0, 7)) return `del ${dia(primero)} al ${dia(ultimo)} de ${mes(ultimo)}`
  return `del ${dia(primero)} de ${mes(primero)} al ${dia(ultimo)} de ${mes(ultimo)}`
}

export interface FilaSemana extends FilaCompromisoMes {
  grupo: string
}

export interface GrupoSemana {
  grupo: string
  filas: FilaSemana[]
  porDia: Record<string, MontosMoneda>
  faltaPagar: MontosMoneda
}

export interface SemanaArmada {
  grupos: GrupoSemana[]
  totalPorDia: Record<string, MontosMoneda>
  totalFaltaPagar: MontosMoneda
  feriados: Set<string>
  hayFilas: boolean
}

function vacio(): MontosMoneda {
  return { ars: 0, usd: 0 }
}

export function sumarMoneda(destino: MontosMoneda, moneda: MonedaCompromiso, centavos: number): void {
  if (moneda === 'USD') destino.usd += centavos
  else destino.ars += centavos
}

/** Lo que pesa una celda en el subtotal del día: lo previsto, o lo pagado si no había nada previsto. */
export function centavosDeCelda(celda: { planificadoCentavos: number; pagadoCentavos: number } | undefined): number {
  if (!celda) return 0
  return celda.planificadoCentavos > 0 ? celda.planificadoCentavos : celda.pagadoCentavos
}

function tieneAlgo(fila: FilaCompromisoMes, dias: string[]): boolean {
  return dias.some((dia) => centavosDeCelda(fila.porDia[dia]) > 0)
}

/**
 * Une las planillas de los meses que toca la semana (una fila puede estar en las dos si vence en un mes
 * y se pagó en el otro) y deja solo las filas con algo en estos cinco días.
 */
export function armarSemana(planillas: PlanillaCompromisosMes[], dias: string[]): SemanaArmada {
  const ordenGrupos: string[] = []
  const filasPorId = new Map<string, FilaSemana>()
  const feriados = new Set<string>()

  for (const planilla of planillas) {
    for (const columna of planilla.dias) {
      if (columna.tipo === 'feriado') feriados.add(columna.fecha)
    }
    for (const grupo of planilla.grupos) {
      if (!ordenGrupos.includes(grupo.grupo)) ordenGrupos.push(grupo.grupo)
      for (const fila of grupo.filas) {
        const previa = filasPorId.get(fila.compromisoId)
        if (previa) {
          previa.porDia = { ...previa.porDia, ...fila.porDia }
          continue
        }
        filasPorId.set(fila.compromisoId, { ...fila, porDia: { ...fila.porDia }, grupo: grupo.grupo })
      }
    }
  }

  const totalPorDia: Record<string, MontosMoneda> = Object.fromEntries(dias.map((dia) => [dia, vacio()]))
  const totalFaltaPagar = vacio()
  const grupos: GrupoSemana[] = []

  for (const nombre of ordenGrupos) {
    const filas = [...filasPorId.values()]
      .filter((fila) => fila.grupo === nombre && tieneAlgo(fila, dias))
      .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento) || a.concepto.localeCompare(b.concepto, 'es'))
    if (filas.length === 0) continue
    const porDia: Record<string, MontosMoneda> = Object.fromEntries(dias.map((dia) => [dia, vacio()]))
    const faltaPagar = vacio()
    for (const fila of filas) {
      for (const dia of dias) {
        const centavos = centavosDeCelda(fila.porDia[dia])
        if (centavos <= 0) continue
        sumarMoneda(porDia[dia]!, fila.moneda, centavos)
        sumarMoneda(totalPorDia[dia]!, fila.moneda, centavos)
      }
      sumarMoneda(faltaPagar, fila.moneda, fila.diferenciaCentavos)
      sumarMoneda(totalFaltaPagar, fila.moneda, fila.diferenciaCentavos)
    }
    grupos.push({ grupo: nombre, filas, porDia, faltaPagar })
  }

  return { grupos, totalPorDia, totalFaltaPagar, feriados, hayFilas: grupos.length > 0 }
}

/** "pagado la mitad" o "pagado 1,2 M de 2,4 M" cuando hay un pago parcial. */
export function textoParcial(fila: FilaCompromisoMes, corto: (centavos: number, moneda: MonedaCompromiso) => string): string | null {
  if (fila.acumuladoCentavos <= 0 || fila.diferenciaCentavos <= 0) return null
  if (fila.acumuladoCentavos * 2 === fila.importeCentavos) return 'pagado la mitad'
  return `pagado ${corto(fila.acumuladoCentavos, fila.moneda)} de ${corto(fila.importeCentavos, fila.moneda)}`
}
