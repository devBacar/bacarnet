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

/**
 * La planilla del mes también trae vencidos de antes que no se movieron en estos días.
 * Hoy ya lista lo que vence o se paga en los meses cargados; esos arrastres no van acá.
 */
function visibleEnHoy(fila: FilaCompromisoMes): boolean {
  if (fila.deMesAnterior !== true) return true
  return Object.values(fila.porDia).some((celda) => celda.planificadoCentavos > 0 || celda.pagadoCentavos > 0)
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
        if (!visibleEnHoy(fila)) continue
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

/** "pagado $X de $Y" cuando hay un pago parcial. */
export function textoParcial(fila: FilaCompromisoMes, corto: (centavos: number, moneda: MonedaCompromiso) => string): string | null {
  if (fila.acumuladoCentavos <= 0 || fila.diferenciaCentavos <= 0) return null
  return `pagado ${corto(fila.acumuladoCentavos, fila.moneda)} de ${corto(fila.importeCentavos, fila.moneda)}`
}

export function textoComoSePaga(medio: string): string {
  if (medio === 'cheque') return 'con cheque'
  if (medio === 'efectivo') return 'en efectivo'
  return 'por transferencia'
}

/** "venció ayer" o "venció el martes". */
export function textoVencido(fecha: string, hoy: string): string | null {
  if (fecha >= hoy) return null
  if (fecha === sumarDias(hoy, -1)) return 'venció ayer'
  const nombre = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${fecha}T12:00:00Z`))
  return `venció el ${nombre}`
}

/** "Hoy jueves 1" o "Viernes 2". */
export function tituloDiaLista(fecha: string, hoy: string): { texto: string; esHoy: boolean } {
  const nombre = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${fecha}T12:00:00Z`))
  const numero = Number(fecha.slice(8))
  if (fecha === hoy) return { texto: `Hoy ${nombre} ${numero}`, esHoy: true }
  return { texto: `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${numero}`, esHoy: false }
}

export interface FilaListaSemana {
  compromisoId: string
  concepto: string
  proveedorONombre: string
  grupo: string
  moneda: MonedaCompromiso
  cuota: string | null
  medioPago: string
  fechaVencimiento: string
  importeCentavos: number
  acumuladoCentavos: number
  diferenciaCentavos: number
  enFirmaCentavos: number
  faltaCentavos: number
  estado: string
}

export interface DiaListaSemana {
  fecha: string
  filas: FilaListaSemana[]
  total: MontosMoneda
}

export interface ListaSemana {
  vencidos: FilaListaSemana[]
  totalVencidos: MontosMoneda
  dias: DiaListaSemana[]
}

function enFirmaDe(fila: FilaCompromisoMes): number {
  const extra = fila.enFirmaCentavos
  if (fila.estado === 'confeccionada_pendiente_autorizacion') return fila.diferenciaCentavos
  if (typeof extra === 'number' && extra > 0) return Math.min(extra, fila.diferenciaCentavos)
  return 0
}

function aLista(fila: FilaSemana, dias: string[]): FilaListaSemana & { dia: string | null } {
  const enFirmaCentavos = enFirmaDe(fila)
  return {
    dia: diaColocado(fila, dias),
    compromisoId: fila.compromisoId,
    concepto: fila.concepto,
    proveedorONombre: fila.proveedorONombre,
    grupo: fila.grupo,
    moneda: fila.moneda,
    cuota: fila.cuota,
    medioPago: fila.medioPago,
    fechaVencimiento: fila.fechaVencimiento,
    importeCentavos: fila.importeCentavos,
    acumuladoCentavos: fila.acumuladoCentavos,
    diferenciaCentavos: fila.diferenciaCentavos,
    enFirmaCentavos,
    faltaCentavos: Math.max(0, fila.diferenciaCentavos - enFirmaCentavos),
    estado: fila.estado,
  }
}

function unirFilas(planillas: PlanillaCompromisosMes[]): FilaSemana[] {
  const orden: string[] = []
  const porId = new Map<string, FilaSemana>()
  for (const planilla of planillas) {
    for (const grupo of planilla.grupos) {
      for (const fila of grupo.filas) {
        if (!visibleEnHoy(fila)) continue
        const previa = porId.get(fila.compromisoId)
        if (previa) {
          previa.porDia = { ...previa.porDia, ...fila.porDia }
          continue
        }
        orden.push(fila.compromisoId)
        porId.set(fila.compromisoId, { ...fila, porDia: { ...fila.porDia }, grupo: grupo.grupo })
      }
    }
  }
  return orden.flatMap((id) => {
    const fila = porId.get(id)
    return fila ? [fila] : []
  })
}

function diaColocado(fila: FilaCompromisoMes, dias: string[]): string | null {
  const conPlan = dias.find((dia) => (fila.porDia[dia]?.planificadoCentavos ?? 0) > 0)
  if (conPlan) return conPlan
  const conPago = dias.find((dia) => (fila.porDia[dia]?.pagadoCentavos ?? 0) > 0)
  if (conPago) return conPago
  return dias.includes(fila.fechaVencimiento) ? fila.fechaVencimiento : null
}

function sumarFalta(filas: readonly FilaListaSemana[]): MontosMoneda {
  const total = vacio()
  for (const fila of filas) sumarMoneda(total, fila.moneda, fila.faltaCentavos)
  return total
}

/**
 * Lista de la semana: vencidos aparte (solo la semana actual) y un bloque por día hábil.
 * En la semana actual, lo ya pasado entra en vencidos y lo pagado de esos días no se muestra.
 */
export function armarListaSemana(input: {
  planillas: PlanillaCompromisosMes[]
  dias: string[]
  hoy: string
  esEstaSemana: boolean
  feriados?: ReadonlySet<string>
}): ListaSemana {
  const feriados = new Set<string>(input.feriados ?? [])
  for (const planilla of input.planillas) {
    for (const columna of planilla.dias) {
      if (columna.tipo === 'feriado') feriados.add(columna.fecha)
    }
  }
  const filas = unirFilas(input.planillas).map((fila) => aLista(fila, input.dias))
  const vencidos = input.esEstaSemana
    ? filas
        .filter((fila) => fila.fechaVencimiento < input.hoy && fila.diferenciaCentavos > 0 && fila.estado !== 'pagado')
        .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento) || a.concepto.localeCompare(b.concepto, 'es'))
    : []
  const idsVencidos = new Set(vencidos.map((fila) => fila.compromisoId))
  const desde = input.esEstaSemana ? input.dias.filter((dia) => dia >= input.hoy) : input.dias
  const dias: DiaListaSemana[] = []
  for (const fecha of desde) {
    if (feriados.has(fecha)) continue
    const delDia = filas
      .filter((fila) => !idsVencidos.has(fila.compromisoId) && fila.dia === fecha)
      .sort((a, b) => a.concepto.localeCompare(b.concepto, 'es'))
    const visibles = input.esEstaSemana
      ? delDia.filter((fila) => fila.faltaCentavos > 0 || fila.enFirmaCentavos > 0)
      : delDia
    if (!input.esEstaSemana && visibles.length === 0) continue
    dias.push({ fecha, filas: visibles, total: sumarFalta(visibles) })
  }
  return { vencidos, totalVencidos: sumarFalta(vencidos), dias }
}
