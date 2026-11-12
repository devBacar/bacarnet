import type { ChequeOcasionalDoc, OperacionUsdParseada } from './cheque-ocasional.types.js'
import { chequesDeRedondeo } from './detalle-interes.js'
import type { ProveedorDelCatalogo } from './operaciones-usd.js'
import { parsearUsdSuelto } from './parsear-obs.js'
import { mismoBeneficiario } from './propuesta-renovacion.js'

/**
 * El paso a paso de una operación en dólares de la revisión asistida. El OBS dice los dólares pedidos y la cotización
 * ("30000 TC1440"); los cheques casi siempre suman más, porque se pagan a plazo y traen el interés adentro. Con datos
 * reales (11/2026) la diferencia cuadra con un interés mensual por los días que faltan para cada cheque: LIO 05/08
 * da justo 9 % mensual por 33 días, MANA 10/03 11 % mensual. Se arma:
 *  1. qué se pidió (dólares × cotización),
 *  2. cómo se pagó (cheques por vencimiento, y otras partes de la misma operación con otra emisión u OBS),
 *  3. la cuenta: cheques − dólares × cotización, cotización que quedó y la tasa mensual que da,
 *  4. por qué tiene sentido: el plazo y las otras operaciones en dólares del proveedor (o del mismo mes).
 * No cambia ningún dato.
 */

export interface VencimientoDolares {
  fecha: string | null
  /** Días desde la emisión. */
  dias: number | null
  cantidadCheques: number
  montoCentavos: number
}

/** Otra parte de la misma operación: mismos dólares y cotización, otra emisión u otro OBS. */
export interface ParteDolares {
  fechaEmision: string | null
  obs: string
  cantidadCheques: number
  montoCentavos: number
}

/** La tasa redonda con la que los cheques, llevados a la fecha de emisión, dan justo dólares × cotización. */
export interface TasaRedondaDolares {
  /** 'interes': cheque = parte × (1 + tasa × días/30). 'descuento': parte = cheque × (1 − tasa × días/30). */
  modo: 'interes' | 'descuento'
  tasaMensualPorcentaje: number
  /** Lo que valen los cheques a la fecha de emisión con esa tasa. */
  valorHoyCentavos: number
  /** Valor hoy − dólares × cotización. */
  diferenciaCentavos: number
  /**
   * 'al_peso': cierra con $1 de margen por cheque. 'a_miles': los cheques salieron por montos redondos (ej. $5.955.000)
   * y cierra con hasta $1.000 por cheque (MANA 10/03: 11,0003 % mensual).
   */
  ajuste: 'al_peso' | 'a_miles'
}

/** Otra operación en dólares, para comparar la tasa. */
export interface OperacionDolaresComparable {
  proveedor: string
  mismoProveedor: boolean
  fechaEmision: string
  obs: string
  montoUsd: number
  cotizacion: number
  capitalCentavos: number
  chequesCentavos: number
  plazoDias: number
  /** Tasa mensual (interés simple por los días de cada cheque). */
  mensualPorcentaje: number
}

export type LecturaDolares = 'justo' | 'tasa_redonda' | 'interes_por_plazo' | 'sin_plazo' | 'faltan_cheques'

export interface DetalleDolares {
  montoUsd: number
  cotizacion: number
  capitalCentavos: number
  cantidadCheques: number
  totalChequesCentavos: number
  vencimientos: VencimientoDolares[]
  /** Si todos los cheques son iguales: cuántos dólares cubre cada uno y cuánto valían al TC del OBS. */
  chequesIguales: { usdPorCheque: number; capitalPorChequeCentavos: number; montoCentavos: number } | null
  partes: ParteDolares[]
  /** Cheques − dólares × cotización (solo los cheques de este grupo). */
  diferenciaCentavos: number
  /** La diferencia es solo redondeo al peso: cuántos cheques. Null si es más. */
  redondeoCheques: number | null
  /** Diferencia ÷ capital (3,78 = 3,78 %). */
  recargoPorcentaje: number
  /** Pesos por dólar que quedaron: cheques ÷ dólares. */
  cotizacionEfectiva: number
  /** Plazo promedio ponderado por monto, en días desde la emisión. */
  plazoPromedioDias: number | null
  /** Tasa mensual que da (interés simple por los días de cada cheque). Null si no hay plazo. */
  mensualPorcentaje: number | null
  tasaRedonda: TasaRedondaDolares | null
  comparables: OperacionDolaresComparable[]
  /** Rango de la tasa mensual de las otras operaciones del mismo proveedor. */
  rangoProveedor: { min: number; max: number } | null
  lectura: LecturaDolares
}

export interface ContextoDolares {
  todos: ChequeOcasionalDoc[]
  catalogo: ReadonlyMap<string, ProveedorDelCatalogo>
}

/** Tasas mensuales que se prueban: de 0,25 % a 20 % de a 0,25 %. */
const TASAS_BP = Array.from({ length: 80 }, (_, i) => (i + 1) * 25)
/** Menos de una semana de plazo promedio: el recargo no puede ser interés por plazo. */
const PLAZO_MINIMO_DIAS = 7
/** Una tasa mensual por encima de esto no es interés por plazo razonable. */
const MENSUAL_MAXIMA = 30
/** Otras partes de la misma operación: emitidas hasta estos días antes o después. */
const DIAS_PARTES = 10
/** Operaciones de otros proveedores que sirven para comparar: emitidas hasta estos días antes o después. */
const DIAS_COMPARABLES = 45
const MAX_COMPARABLES = 6
/** Una operación sirve para comparar si sus cheques están entre esto del capital (no es una parte suelta). */
const RECARGO_COMPARABLE = { min: -0.01, max: 0.6 }

const suma = (lista: { montoCentavos: number }[]): number => lista.reduce((s, d) => s + d.montoCentavos, 0)
const dias = (desde: string, hasta: string): number =>
  Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000)
const clave = (d: ChequeOcasionalDoc): string => `${d.beneficiarioNormalizado}|${d.fechaEmision ?? ''}|${d.obsOriginal.trim()}`

export function usdDelGrupo(grupo: ChequeOcasionalDoc[]): OperacionUsdParseada | null {
  return grupo.find((d) => d.operacionUsd)?.operacionUsd ?? parsearUsdSuelto(grupo[0]?.obsOriginal)
}

interface ChequePlazo {
  montoCentavos: number
  dias: number
}

function plazos(docs: ChequeOcasionalDoc[], emision: string | null): ChequePlazo[] | null {
  if (!emision || docs.some((d) => !d.fechaVencimiento && !d.fechaEmision)) return null
  return docs.map((d) => ({
    montoCentavos: d.montoCentavos,
    // Una parte emitida otro día corre desde su propia emisión.
    dias: Math.max(0, dias(d.fechaEmision ?? emision, d.fechaVencimiento ?? d.fechaEmision ?? emision)),
  }))
}

const valorHoy = (cheques: ChequePlazo[], tasa: number, modo: 'interes' | 'descuento'): number =>
  cheques.reduce(
    (s, c) => s + (modo === 'interes' ? c.montoCentavos / (1 + (tasa * c.dias) / 30) : c.montoCentavos * (1 - (tasa * c.dias) / 30)),
    0,
  )

/** Tasa mensual simple con la que los cheques valen hoy `capital` (búsqueda binaria). Null si no hay plazo. */
export function tasaMensual(cheques: ChequePlazo[], capitalCentavos: number): number | null {
  if (cheques.length === 0 || cheques.every((c) => c.dias === 0)) return null
  let lo = -0.5
  let hi = 50
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (valorHoy(cheques, mid, 'interes') > capitalCentavos) lo = mid
    else hi = mid
  }
  return ((lo + hi) / 2) * 100
}

/**
 * La tasa redonda con la que los cheques valen hoy justo el capital: primero al peso ($1 de margen por cheque) y, si
 * no, con cheques redondeados a miles ($1.000 por cheque).
 */
export function buscarTasaRedonda(cheques: ChequePlazo[], capitalCentavos: number): TasaRedondaDolares | null {
  if (cheques.length === 0 || cheques.every((c) => c.dias === 0)) return null
  for (const [ajuste, porCheque] of [['al_peso', 100], ['a_miles', 1_000_00]] as const) {
    const tolerancia = cheques.length * porCheque
    let mejor: TasaRedondaDolares | null = null
    for (const modo of ['interes', 'descuento'] as const) {
      // Con margen de $1.000 por cheque, una tasa de a 0,25 % cierra por casualidad seguido: ahí solo tasas enteras.
      for (const bp of ajuste === 'al_peso' ? TASAS_BP : TASAS_BP.filter((t) => t % 100 === 0)) {
        const v = Math.round(valorHoy(cheques, bp / 10_000, modo))
        const dif = v - capitalCentavos
        if (Math.abs(dif) <= tolerancia && (!mejor || Math.abs(dif) < Math.abs(mejor.diferenciaCentavos))) {
          mejor = { modo, tasaMensualPorcentaje: bp / 100, valorHoyCentavos: v, diferenciaCentavos: dif, ajuste }
        }
      }
    }
    if (mejor) return mejor
  }
  return null
}

function plazoPromedio(cheques: ChequePlazo[]): number | null {
  const total = suma(cheques)
  if (total <= 0) return null
  return cheques.reduce((s, c) => s + c.montoCentavos * c.dias, 0) / total
}

function vencimientos(grupo: ChequeOcasionalDoc[], emision: string | null): VencimientoDolares[] {
  const por = new Map<string, VencimientoDolares>()
  for (const d of grupo) {
    const k = d.fechaVencimiento ?? ''
    const v = por.get(k) ?? { fecha: d.fechaVencimiento, dias: emision && d.fechaVencimiento ? dias(emision, d.fechaVencimiento) : null, cantidadCheques: 0, montoCentavos: 0 }
    v.cantidadCheques += 1
    v.montoCentavos += d.montoCentavos
    por.set(k, v)
  }
  return [...por.values()].sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''))
}

/** Todas las operaciones en dólares (una por proveedor + emisión + OBS), con sus cheques. */
function operacionesUsd(todos: ChequeOcasionalDoc[]): { docs: ChequeOcasionalDoc[]; usd: OperacionUsdParseada }[] {
  const por = new Map<string, ChequeOcasionalDoc[]>()
  for (const d of todos) {
    if (d.baja || !d.fechaEmision) continue
    if (!d.operacionUsd && !parsearUsdSuelto(d.obsOriginal)) continue
    por.set(clave(d), [...(por.get(clave(d)) ?? []), d])
  }
  return [...por.values()].map((docs) => ({ docs, usd: usdDelGrupo(docs)! }))
}

const mismaOperacionUsd = (a: OperacionUsdParseada, b: OperacionUsdParseada): boolean => a.montoUsd === b.montoUsd && a.cotizacion === b.cotizacion

export function armarDetalleDolares(grupo: ChequeOcasionalDoc[], ctx: ContextoDolares): DetalleDolares | null {
  const usd = usdDelGrupo(grupo)
  const primero = grupo[0]
  if (!usd || !primero) return null
  const emision = primero.fechaEmision
  const capital = Math.round(usd.montoUsd * usd.cotizacion * 100)
  const total = suma(grupo)
  const enGrupo = new Set(grupo)
  const delProveedor = operacionesUsd(ctx.todos.filter((d) => !enGrupo.has(d))).filter((o) => mismoBeneficiario(o.docs[0]!, primero, ctx.catalogo))

  // Otras partes: mismos dólares y cotización, emitidas cerca (un cheque suelto el día anterior, por ejemplo).
  const partesOps = emision
    ? delProveedor.filter((o) => mismaOperacionUsd(o.usd, usd) && Math.abs(dias(emision, o.docs[0]!.fechaEmision!)) <= DIAS_PARTES)
    : []
  const partes: ParteDolares[] = partesOps
    .map((o) => ({ fechaEmision: o.docs[0]!.fechaEmision, obs: o.docs[0]!.obsOriginal.trim(), cantidadCheques: o.docs.length, montoCentavos: suma(o.docs) }))
    .sort((a, b) => (a.fechaEmision ?? '').localeCompare(b.fechaEmision ?? ''))

  // Las otras partes se muestran pero no entran en la cuenta: no se sabe cuál de ellas completa a cuál, y sumarlas
  // todas puede inventar un recargo (MANA usd 50.000 TC1440 tiene tres emisiones del 20 al 24/02).
  const docsCuenta = grupo
  const totalCuenta = total
  const diferencia = totalCuenta - capital
  const cheques = plazos(docsCuenta, emision)
  const plazo = cheques ? plazoPromedio(cheques) : null
  const mensual = cheques && diferencia > 0 ? tasaMensual(cheques, capital) : null
  const redondeo = chequesDeRedondeo(diferencia, docsCuenta.length)
  const tasaRedonda = cheques && diferencia > 0 && redondeo === null ? buscarTasaRedonda(cheques, capital) : null

  const montos = new Set(grupo.map((d) => d.montoCentavos))
  const usdPorCheque = usd.montoUsd / grupo.length
  const chequesIguales =
    grupo.length > 1 && montos.size === 1 && Number.isInteger(usdPorCheque * 100)
      ? { usdPorCheque, capitalPorChequeCentavos: Math.round(usdPorCheque * usd.cotizacion * 100), montoCentavos: primero.montoCentavos }
      : null

  // Para comparar: las otras operaciones del proveedor; si hay pocas, las de otros proveedores de esos días.
  const comparable = (o: { docs: ChequeOcasionalDoc[]; usd: OperacionUsdParseada }, mismoProveedor: boolean): OperacionDolaresComparable | null => {
    const cap = Math.round(o.usd.montoUsd * o.usd.cotizacion * 100)
    const tot = suma(o.docs)
    const recargo = cap > 0 ? (tot - cap) / cap : 0
    if (recargo < RECARGO_COMPARABLE.min || recargo > RECARGO_COMPARABLE.max) return null
    const p = plazos(o.docs, o.docs[0]!.fechaEmision)
    const prom = p ? plazoPromedio(p) : null
    const m = p && tot > cap ? tasaMensual(p, cap) : null
    if (prom === null || prom < PLAZO_MINIMO_DIAS || m === null || m > MENSUAL_MAXIMA) return null
    return {
      proveedor: o.docs[0]!.beneficiario,
      mismoProveedor,
      fechaEmision: o.docs[0]!.fechaEmision!,
      obs: o.docs[0]!.obsOriginal.trim(),
      montoUsd: o.usd.montoUsd,
      cotizacion: o.usd.cotizacion,
      capitalCentavos: cap,
      chequesCentavos: tot,
      plazoDias: Math.round(prom),
      mensualPorcentaje: m,
    }
  }
  const cercania = (f: string): number => (emision ? Math.abs(dias(emision, f)) : 0)
  const propias = delProveedor
    .filter((o) => !partesOps.includes(o))
    .map((o) => comparable(o, true))
    .filter((x): x is OperacionDolaresComparable => x !== null)
    .sort((a, b) => cercania(a.fechaEmision) - cercania(b.fechaEmision))
    .slice(0, MAX_COMPARABLES)
  const ajenas =
    propias.length >= 3 || !emision
      ? []
      : operacionesUsd(ctx.todos.filter((d) => !enGrupo.has(d)))
          .filter((o) => !mismoBeneficiario(o.docs[0]!, primero, ctx.catalogo) && cercania(o.docs[0]!.fechaEmision!) <= DIAS_COMPARABLES)
          .map((o) => comparable(o, false))
          .filter((x): x is OperacionDolaresComparable => x !== null)
          .sort((a, b) => cercania(a.fechaEmision) - cercania(b.fechaEmision))
          .slice(0, MAX_COMPARABLES - propias.length)
  const comparables = [...propias, ...ajenas].sort((a, b) => b.fechaEmision.localeCompare(a.fechaEmision))
  const tasasPropias = propias.map((c) => c.mensualPorcentaje)

  let lectura: LecturaDolares
  if (redondeo !== null) lectura = 'justo'
  else if (diferencia < 0) lectura = 'faltan_cheques'
  else if (plazo === null || plazo < PLAZO_MINIMO_DIAS || mensual === null || mensual > MENSUAL_MAXIMA) lectura = 'sin_plazo'
  else if (tasaRedonda) lectura = 'tasa_redonda'
  else lectura = 'interes_por_plazo'

  return {
    montoUsd: usd.montoUsd,
    cotizacion: usd.cotizacion,
    capitalCentavos: capital,
    cantidadCheques: docsCuenta.length,
    totalChequesCentavos: totalCuenta,
    vencimientos: vencimientos(grupo, emision),
    chequesIguales,
    partes,
    diferenciaCentavos: diferencia,
    redondeoCheques: redondeo,
    recargoPorcentaje: capital > 0 ? (diferencia / capital) * 100 : 0,
    cotizacionEfectiva: totalCuenta / 100 / usd.montoUsd,
    plazoPromedioDias: plazo,
    mensualPorcentaje: mensual,
    tasaRedonda,
    comparables,
    rangoProveedor: tasasPropias.length > 0 ? { min: Math.min(...tasasPropias), max: Math.max(...tasasPropias) } : null,
    lectura,
  }
}
