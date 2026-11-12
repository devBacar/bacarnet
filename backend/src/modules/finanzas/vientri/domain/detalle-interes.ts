import type { ChequeEnOperacion, ChequeOcasionalDoc, OperacionRenovacion } from './cheque-ocasional.types.js'
import {
  basesProbadas,
  chequesVivos,
  coincide,
  cuotasDelInteres,
  TASAS_BP,
  type BaseProbada,
  type OperacionDeLaBase,
  type SugerenciaInteres,
} from './interes-posicion.js'
import type { ProveedorDelCatalogo } from './operaciones-usd.js'
import { mismoBeneficiario, numeroCorto } from './propuesta-renovacion.js'

/**
 * El paso a paso de cualquier interés de la revisión asistida. Todos son la misma cuenta: cada pago de interés es una
 * tasa por una base. Lo que cambia es cómo se agrupan los pagos (cheques sueltos o cuotas) y qué base le toca a cada
 * uno. Con eso se arma, igual para todos:
 *  1. qué se pagó,
 *  2. sobre qué se calculó (un tramo por base),
 *  3. la cuenta, con la diferencia real (nunca se copia el total),
 *  4. por qué tiene sentido: la renovación relacionada, cuánto corrió los vencimientos y si ya traía interés adentro,
 *  5. qué tasa daban las otras bases posibles.
 * No cambia ningún dato.
 */

export type FormaInteres = 'mes_vencimiento' | 'mismo_vencimiento' | 'renovacion' | 'porcentaje_renovacion' | 'diferencia'
export type FuerzaDetalle = 'fuerte' | 'posible' | 'debil'

/** Un pago de interés: un cheque suelto o una cuota (los cheques que vencen juntos). */
export interface PagoInteres {
  desde: string | null
  hasta: string | null
  cantidadCheques: number
  montoCentavos: number
}

/** Un lote de cheques de la base (misma emisión y OBS). */
export interface LoteBase {
  fechaEmision: string | null
  obs: string
  cantidadCheques: number
  montoCentavos: number
  esDolares: boolean
  esRenovacion: boolean
}

/** La renovación que explica un interés: qué se corrió, cuánto, y si ya traía interés adentro. */
export interface RenovacionRelacionada {
  fechaEmision: string
  obs: string
  cantidadViejos: number
  cantidadNuevos: number
  vencianDesde: string | null
  vencianHasta: string | null
  vencenDesde: string | null
  vencenHasta: string | null
  dias: number | null
  meses: number | null
  viejosCentavos: number
  nuevosCentavos: number
  /** Nuevos − viejos: lo que ya trae adentro. */
  interesAdentroCentavos: number
  /** Se hizo el mismo día que se emitió el interés. */
  mismoDia: boolean
}

/** Una base y los cheques de interés que explica. */
export interface TramoInteres {
  /** Números de los cheques de interés de este tramo. */
  chequesInteres: string[]
  /** Lo que suman esos cheques. */
  pagadoCentavos: number
  /** Vencimientos de esos cheques (para decir "el que vence el 25/10"). */
  vencimientos: string[]
  baseDescripcion: string
  baseCentavos: number
  cantidadChequesBase: number
  lotes: LoteBase[]
  /** 'tasa': base × tasa × períodos. 'resta': nuevos − viejos de una renovación. */
  tipoCuenta: 'tasa' | 'resta'
  /** Solo 'resta': lo que suman los cheques nuevos. */
  nuevosCentavos: number | null
  esperadoCentavos: number
  renovacion: RenovacionRelacionada | null
  /** Otras bases posibles y la tasa que daría cada una (pago ÷ base). Vacío si no se probaron. */
  alternativas: BaseProbada[]
}

export interface DetalleInteres {
  forma: FormaInteres
  /** 6 = 6 %. Si `porMes`, es por mes. */
  tasaPorcentaje: number
  porMes: boolean
  /** Meses que se cobran (1 si no es por mes). */
  periodos: number
  totalPagadoCentavos: number
  pagos: PagoInteres[]
  tramos: TramoInteres[]
  esperadoCentavos: number
  diferenciaCentavos: number
  /** Si la diferencia es solo redondeo al peso (hasta $0,50 por cheque): cuántos cheques. Null si es más. */
  redondeoCheques: number | null
}

/** Lo que necesita el detalle de la revisión asistida (mismo contexto que `analizarARevisar`). */
export interface ContextoDetalle {
  todos: ChequeOcasionalDoc[]
  catalogo: ReadonlyMap<string, ProveedorDelCatalogo>
  operaciones: OperacionRenovacion[]
  porNumero: Map<string, ChequeOcasionalDoc>
}

/** Una base múltiplo de $1.000 es redonda: cualquier cheque redondo "da justo" un % de ella. */
const BASE_REDONDA_CENTAVOS = 1_000_00

const suma = (lista: { montoCentavos: number }[]): number => lista.reduce((s, d) => s + d.montoCentavos, 0)
const dias = (desde: string, hasta: string): number =>
  Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000)

/** Cuántos cheques explican la diferencia por redondeo al peso (hasta $0,50 cada uno), o null. */
export function chequesDeRedondeo(diferenciaCentavos: number, cheques: number): number | null {
  return cheques > 0 && Math.abs(diferenciaCentavos) <= cheques * 50 + 1 ? cheques : null
}

function rango(lista: { fechaVencimiento: string | null }[]): { desde: string | null; hasta: string | null } {
  const f = lista.map((c) => c.fechaVencimiento).filter((x): x is string => x !== null).sort()
  return { desde: f[0] ?? null, hasta: f[f.length - 1] ?? null }
}

function resumenRenovacion(op: OperacionRenovacion, emisionInteres: string | null): RenovacionRelacionada | null {
  if (!op.fechaEmision) return null
  const v = rango(op.chequesViejos)
  const n = rango(op.chequesNuevos)
  const d = op.diasRenovacion ?? (v.hasta && n.hasta ? dias(v.hasta, n.hasta) : null)
  return {
    fechaEmision: op.fechaEmision,
    obs: op.obsOriginal.trim(),
    cantidadViejos: op.chequesViejos.length,
    cantidadNuevos: op.chequesNuevos.length,
    vencianDesde: v.desde,
    vencianHasta: v.hasta,
    vencenDesde: n.desde,
    vencenHasta: n.hasta,
    dias: d,
    meses: d !== null ? Math.round(d / 30) : null,
    viejosCentavos: op.totalViejosCentavos,
    nuevosCentavos: op.totalNuevosCentavos,
    interesAdentroCentavos: op.interesCentavos,
    mismoDia: op.fechaEmision === emisionInteres,
  }
}

/**
 * La renovación cuyos cheques nuevos forman parte de la base: primero la del mismo día que el interés, después la que
 * más cheques aporta. Null si ninguna base viene de una renovación.
 */
function renovacionDeLaBase(base: { numeroCheque: string }[], emisionInteres: string | null, ctx: ContextoDetalle): RenovacionRelacionada | null {
  const numeros = new Set(base.map((d) => numeroCorto(d.numeroCheque)))
  let mejor: { op: OperacionRenovacion; enBase: number; mismoDia: boolean } | null = null
  for (const op of ctx.operaciones) {
    if (!op.vinculada) continue
    const enBase = op.chequesNuevos.filter((c) => numeros.has(numeroCorto(c.numeroCheque))).length
    if (enBase === 0) continue
    const mismoDia = op.fechaEmision === emisionInteres
    if (!mejor || (mismoDia && !mejor.mismoDia) || (mismoDia === mejor.mismoDia && enBase > mejor.enBase)) mejor = { op, enBase, mismoDia }
  }
  return mejor ? resumenRenovacion(mejor.op, emisionInteres) : null
}

/** Arma los lotes de la base a partir de sus cheques (misma emisión y OBS). */
function lotesDeDocs(docs: ChequeOcasionalDoc[]): LoteBase[] {
  const por = new Map<string, LoteBase>()
  for (const d of docs) {
    const k = `${d.fechaEmision ?? ''}|${d.obsOriginal.trim()}`
    const l = por.get(k) ?? { fechaEmision: d.fechaEmision, obs: d.obsOriginal.trim(), cantidadCheques: 0, montoCentavos: 0, esDolares: false, esRenovacion: false }
    l.cantidadCheques += 1
    l.montoCentavos += d.montoCentavos
    l.esDolares ||= d.operacionUsd != null
    l.esRenovacion ||= d.esRenovacion
    por.set(k, l)
  }
  return [...por.values()].sort((a, b) => (a.fechaEmision ?? '').localeCompare(b.fechaEmision ?? ''))
}

/** Lotes a partir de un resumen de operaciones (cuando no se tienen los cheques de la base). */
function lotesDeResumen(ops: OperacionDeLaBase[], primero: ChequeOcasionalDoc, ctx: ContextoDetalle): LoteBase[] {
  return ops.map((o) => {
    const docs = ctx.todos.filter((d) => d.fechaEmision === o.fechaEmision && d.obsOriginal.trim() === o.obs && mismoBeneficiario(d, primero, ctx.catalogo))
    return {
      fechaEmision: o.fechaEmision,
      obs: o.obs,
      cantidadCheques: o.cantidadCheques,
      montoCentavos: o.montoCentavos,
      esDolares: docs.some((d) => d.operacionUsd != null),
      esRenovacion: docs.some((d) => d.esRenovacion),
    }
  })
}

const docsDe = (lista: ChequeEnOperacion[], ctx: ContextoDetalle): ChequeOcasionalDoc[] =>
  lista.map((c) => ctx.porNumero.get(numeroCorto(c.numeroCheque))).filter((x): x is ChequeOcasionalDoc => x !== undefined)

function pagosSueltos(grupo: ChequeOcasionalDoc[]): PagoInteres[] {
  return grupo
    .slice()
    .sort((a, b) => (a.fechaVencimiento ?? '').localeCompare(b.fechaVencimiento ?? ''))
    .map((c) => ({ desde: c.fechaVencimiento, hasta: c.fechaVencimiento, cantidadCheques: 1, montoCentavos: c.montoCentavos }))
}

function cerrar(
  forma: FormaInteres,
  grupo: ChequeOcasionalDoc[],
  tasaPorcentaje: number,
  porMes: boolean,
  periodos: number,
  pagos: PagoInteres[],
  tramos: TramoInteres[],
): DetalleInteres {
  const total = suma(grupo)
  const esperado = tramos.reduce((s, t) => s + t.esperadoCentavos, 0)
  return {
    forma,
    tasaPorcentaje,
    porMes,
    periodos,
    totalPagadoCentavos: total,
    pagos,
    tramos,
    esperadoCentavos: esperado,
    diferenciaCentavos: total - esperado,
    redondeoCheques: chequesDeRedondeo(total - esperado, grupo.length),
  }
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const nombreMes = (ym: string): string => {
  const [anio, mes] = ym.split('-')
  return `${MESES[Number(mes) - 1]} de ${anio}`
}
const fechaCorta = (ymd: string | null): string => (ymd ? ymd.split('-').reverse().join('/') : 'sin fecha')

/** % mensual sobre todo lo que vence en un mes, pagado en cuotas iguales (ej. MANA 22/09/2026: 6 % × 3 meses sobre enero). */
export function detalleMesVencimiento(grupo: ChequeOcasionalDoc[], s: SugerenciaInteres, ctx: ContextoDetalle, incluirUsd: boolean): DetalleInteres {
  const emision = grupo[0]!.fechaEmision
  const base = chequesVivos(grupo, ctx.todos, ctx.catalogo, incluirUsd).filter((d) => d.fechaVencimiento!.startsWith(s.mesBase!))
  const periodos = s.meses ?? 1
  const tramo: TramoInteres = {
    chequesInteres: grupo.map((d) => d.numeroCheque),
    pagadoCentavos: suma(grupo),
    vencimientos: grupo.map((d) => d.fechaVencimiento!).sort(),
    baseDescripcion: `lo que vence en ${nombreMes(s.mesBase!)}`,
    baseCentavos: s.baseCentavos,
    cantidadChequesBase: s.cantidadChequesBase,
    lotes: lotesDeDocs(base),
    tipoCuenta: 'tasa',
    nuevosCentavos: null,
    esperadoCentavos: Math.round((s.baseCentavos * s.tasaPorcentaje) / 100) * periodos,
    renovacion: renovacionDeLaBase(base, emision, ctx),
    alternativas: basesProbadas(grupo, ctx.todos, ctx.catalogo, { incluirUsd }) ?? [],
  }
  const pagos = cuotasDelInteres(grupo).map((q) => ({ desde: q.desde, hasta: q.hasta, cantidadCheques: q.cheques, montoCentavos: q.montoCentavos }))
  return cerrar('mes_vencimiento', grupo, s.tasaPorcentaje, true, periodos, pagos, [tramo])
}

/**
 * % sobre el capital que vence el mismo día que cada cheque de interés (ej. POVO 16/10/2026: 8 % sobre cada renovación
 * del 08/09). Cada cheque puede ir contra una base distinta: un tramo por base.
 */
export function detalleMismoVencimiento(grupo: ChequeOcasionalDoc[], s: SugerenciaInteres, ctx: ContextoDetalle, incluirUsd: boolean): DetalleInteres {
  const emision = grupo[0]!.fechaEmision
  const vivos = chequesVivos(grupo, ctx.todos, ctx.catalogo, incluirUsd)
  const bp = Math.round(s.tasaPorcentaje * 100)
  const claveOp = (d: ChequeOcasionalDoc) => `${d.fechaEmision ?? ''}|${d.obsOriginal.trim()}`
  const tramos = new Map<string, TramoInteres>()

  for (const c of grupo) {
    const delDia = vivos.filter((d) => d.fechaVencimiento === c.fechaVencimiento)
    const candidatas: { nombre: string; docs: ChequeOcasionalDoc[] }[] = [{ nombre: `lo que vence el ${fechaCorta(c.fechaVencimiento)}`, docs: delDia }]
    for (const k of new Set(delDia.map(claveOp))) {
      const docs = vivos.filter((d) => claveOp(d) === k)
      candidatas.push({ nombre: `la operación del ${fechaCorta(docs[0]!.fechaEmision)}${docs[0]!.obsOriginal.trim() ? ` ("${docs[0]!.obsOriginal.trim()}")` : ''}`, docs })
    }
    const propia = s.porCheque.find((p) => p.numeroCheque === c.numeroCheque)
    const elegida = candidatas.find((b) => suma(b.docs) === propia?.baseCentavos) ?? candidatas[0]!
    const clave = elegida.docs.map((d) => d.numeroCheque).sort().join(',')
    const alternativas: BaseProbada[] = candidatas
      .filter((b, i, todas) => todas.findIndex((x) => suma(x.docs) === suma(b.docs)) === i)
      .map((b) => {
        const total = suma(b.docs)
        return {
          mes: null,
          descripcion: b.nombre,
          cantidadCheques: b.docs.length,
          baseCentavos: total,
          tasaPorcentaje: total > 0 ? (c.montoCentavos / total) * 100 : 0,
          cierra: TASAS_BP.some((t) => coincide(total, t, 1, c.montoCentavos)),
        }
      })
    const t = tramos.get(clave)
    if (t) {
      t.chequesInteres.push(c.numeroCheque)
      t.pagadoCentavos += c.montoCentavos
      t.vencimientos.push(c.fechaVencimiento!)
      t.esperadoCentavos += Math.round((t.baseCentavos * bp) / 10_000)
      continue
    }
    const baseCentavos = suma(elegida.docs)
    tramos.set(clave, {
      chequesInteres: [c.numeroCheque],
      pagadoCentavos: c.montoCentavos,
      vencimientos: [c.fechaVencimiento!],
      baseDescripcion: elegida.nombre,
      baseCentavos,
      cantidadChequesBase: elegida.docs.length,
      lotes: lotesDeDocs(elegida.docs),
      tipoCuenta: 'tasa',
      nuevosCentavos: null,
      esperadoCentavos: Math.round((baseCentavos * bp) / 10_000),
      renovacion: renovacionDeLaBase(elegida.docs, emision, ctx),
      alternativas,
    })
  }
  return cerrar('mismo_vencimiento', grupo, s.tasaPorcentaje, false, 1, pagosSueltos(grupo), [...tramos.values()])
}

/** El total es justo el interés que ya muestra una renovación (nuevos − viejos). */
export function detalleRestaRenovacion(grupo: ChequeOcasionalDoc[], op: OperacionRenovacion, ctx: ContextoDetalle): DetalleInteres {
  const viejos = docsDe(op.chequesViejos, ctx)
  const tramo: TramoInteres = {
    chequesInteres: grupo.map((d) => d.numeroCheque),
    pagadoCentavos: suma(grupo),
    vencimientos: grupo.map((d) => d.fechaVencimiento).filter((x): x is string => x !== null).sort(),
    baseDescripcion: `los cheques viejos de la renovación del ${fechaCorta(op.fechaEmision)}`,
    baseCentavos: op.totalViejosCentavos,
    cantidadChequesBase: op.chequesViejos.length,
    lotes: lotesDeDocs(viejos),
    tipoCuenta: 'resta',
    nuevosCentavos: op.totalNuevosCentavos,
    esperadoCentavos: op.interesCentavos,
    renovacion: resumenRenovacion(op, grupo[0]!.fechaEmision),
    alternativas: [],
  }
  return cerrar('renovacion', grupo, Math.round(op.tasaImplicita * 10_000) / 100, false, 1, pagosSueltos(grupo), [tramo])
}

/** El total es un % redondo de los cheques viejos o de los nuevos de una renovación. */
export function detallePorcentajeRenovacion(
  grupo: ChequeOcasionalDoc[],
  op: OperacionRenovacion,
  cual: 'viejos' | 'nuevos',
  bp: number,
  forma: 'porcentaje_renovacion' | 'diferencia',
  ctx: ContextoDetalle,
): DetalleInteres {
  const lista = cual === 'viejos' ? op.chequesViejos : op.chequesNuevos
  const base = cual === 'viejos' ? op.totalViejosCentavos : op.totalNuevosCentavos
  const tramo: TramoInteres = {
    chequesInteres: grupo.map((d) => d.numeroCheque),
    pagadoCentavos: suma(grupo),
    vencimientos: grupo.map((d) => d.fechaVencimiento).filter((x): x is string => x !== null).sort(),
    baseDescripcion: `los cheques ${cual} de la renovación del ${fechaCorta(op.fechaEmision)}`,
    baseCentavos: base,
    cantidadChequesBase: lista.length,
    lotes: lotesDeDocs(docsDe(lista, ctx)),
    tipoCuenta: 'tasa',
    nuevosCentavos: null,
    esperadoCentavos: Math.round((base * bp) / 10_000),
    renovacion: resumenRenovacion(op, grupo[0]!.fechaEmision),
    alternativas: [],
  }
  return cerrar(forma, grupo, bp / 100, false, 1, pagosSueltos(grupo), [tramo])
}

/** Diferencia: un % chico sobre la misma base de un interés anterior del proveedor. */
export function detalleDiferenciaDeInteres(
  grupo: ChequeOcasionalDoc[],
  anterior: SugerenciaInteres,
  fechaInteres: string,
  bp: number,
  ctx: ContextoDetalle,
): DetalleInteres {
  const tramo: TramoInteres = {
    chequesInteres: grupo.map((d) => d.numeroCheque),
    pagadoCentavos: suma(grupo),
    vencimientos: grupo.map((d) => d.fechaVencimiento).filter((x): x is string => x !== null).sort(),
    baseDescripcion: `la misma base que los intereses del ${fechaCorta(fechaInteres)}`,
    baseCentavos: anterior.baseCentavos,
    cantidadChequesBase: anterior.cantidadChequesBase,
    lotes: lotesDeResumen(anterior.operaciones, grupo[0]!, ctx),
    tipoCuenta: 'tasa',
    nuevosCentavos: null,
    esperadoCentavos: Math.round((anterior.baseCentavos * bp) / 10_000),
    renovacion: null,
    alternativas: [],
  }
  return cerrar('diferencia', grupo, bp / 100, false, 1, pagosSueltos(grupo), [tramo])
}

/**
 * La misma regla para todos:
 *  - dudosa si alguna base es un monto redondo (cualquier cheque redondo "da justo" sobre ella),
 *  - da justo si la diferencia es solo redondeo y en cada tramo una sola base cierra; un % de una renovación de otro
 *    día necesita además que sea del mismo día (hay muchas renovaciones cerca y alguna cierra por casualidad),
 *  - si no, posible.
 */
export function fuerzaDelDetalle(d: DetalleInteres): FuerzaDetalle {
  if (d.tramos.some((t) => t.tipoCuenta === 'tasa' && t.baseCentavos % BASE_REDONDA_CENTAVOS === 0)) return 'debil'
  if (d.redondeoCheques === null) return 'posible'
  if (d.tramos.some((t) => t.alternativas.filter((a) => a.cierra).length > 1)) return 'posible'
  if ((d.forma === 'porcentaje_renovacion' || d.forma === 'diferencia') && !d.tramos.every((t) => t.renovacion?.mismoDia)) return 'posible'
  return 'fuerte'
}

/**
 * Avisos que salen del detalle: base redonda y más de una base que cierra. Que la renovación ya traía interés adentro
 * se muestra con su cuenta en el paso "Por qué tiene sentido", no como aviso suelto.
 */
export function avisosDelDetalle(d: DetalleInteres): string[] {
  const avisos: string[] = []
  if (d.tramos.some((t) => t.tipoCuenta === 'tasa' && t.baseCentavos % BASE_REDONDA_CENTAVOS === 0)) {
    avisos.push('La base es un monto redondo: la coincidencia puede ser casualidad')
  }
  if (d.tramos.some((t) => t.alternativas.filter((a) => a.cierra).length > 1)) {
    avisos.push('Más de una base da una tasa redonda: hay que confirmar cuál es')
  }
  return avisos
}
