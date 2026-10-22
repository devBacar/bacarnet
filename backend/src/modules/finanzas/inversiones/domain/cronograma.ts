import { anioDe, diasEntre, dias30360, esBisiesto, sumarMeses } from './fechas.js'
import {
  MESES_POR_PERIODO,
  type BaseDias,
  type CondicionesInversion,
  type Cuota,
  type SistemaDevolucion,
  type Tasa,
} from './inversion.types.js'

export interface TasaPeriodo {
  tnaPct: number
  estimada: boolean
}

export interface ValorIndice {
  valor: number
  estimada: boolean
}

/**
 * De dónde salen las tasas y los índices. Para tasa fija no hace falta nada.
 * - tasaReferencia: valor de la referencia (BADLAR, TAMAR…) vigente en una fecha.
 * - indice: valor de UVA o CER en una fecha.
 */
export interface FuentesTasas {
  tasaReferencia?: (fecha: string) => TasaPeriodo | null
  indice?: (fecha: string) => ValorIndice | null
}

export function diasDelPeriodo(base: BaseDias, desde: string, hasta: string): number {
  return base === 360 ? dias30360(desde, hasta) : diasEntre(desde, hasta)
}

export function divisorAnual(base: BaseDias, desde: string): number {
  if (base === 360 || base === '360_reales') return 360
  if (base === 365) return 365
  return esBisiesto(anioDe(desde)) ? 366 : 365
}

/** Interés simple de un período, en centavos (sin redondear). */
export function interesSimple(saldoCentavos: number, tnaPct: number, base: BaseDias, desde: string, hasta: string): number {
  const dias = diasDelPeriodo(base, desde, hasta)
  if (dias <= 0 || saldoCentavos <= 0) return 0
  return (saldoCentavos * (tnaPct / 100) * dias) / divisorAnual(base, desde)
}

export function tasaDelPeriodo(tasa: Tasa, desde: string, fuentes: FuentesTasas): TasaPeriodo {
  if (tasa.tipo === 'fija' || tasa.tipo === 'ajustable') return { tnaPct: tasa.tnaPct, estimada: false }
  const ref = fuentes.tasaReferencia?.(desde)
  if (!ref) throw new Error('No hay valores de la tasa de referencia para calcular las cuotas. Actualizá las tasas del BCRA.')
  let tna = ref.tnaPct + tasa.spreadPct
  if (tasa.pisoPct != null) tna = Math.max(tna, tasa.pisoPct)
  if (tasa.techoPct != null) tna = Math.min(tna, tasa.techoPct)
  return { tnaPct: redondear(tna, 4), estimada: ref.estimada }
}

function redondear(n: number, decimales: number): number {
  const f = 10 ** decimales
  return Math.round(n * f) / f
}

export interface OpcionesCronograma {
  /** Inversiones sin vencimiento: hasta qué fecha generar las cuotas de intereses. */
  hasta?: string | null
}

/** Fechas de vencimiento de cada cuota según las condiciones. */
export function fechasDeCuotas(
  cond: Pick<CondicionesInversion, 'sistema' | 'fechaAlta' | 'periodicidad' | 'cantidadCuotas' | 'fechaVencimiento' | 'cuotasAMedida' | 'sinVencimiento'>,
  opciones: OpcionesCronograma = {},
): string[] {
  if (cond.sinVencimiento) {
    if (!opciones.hasta) throw new Error('Falta hasta cuándo generar las cuotas de una inversión sin vencimiento')
    const paso = MESES_POR_PERIODO[cond.periodicidad]
    const fechas: string[] = []
    for (let k = 1; k < 1000; k += 1) {
      const f = sumarMeses(cond.fechaAlta, paso * k)
      if (f > opciones.hasta) break
      fechas.push(f)
    }
    return fechas
  }
  if (cond.sistema === 'a_medida') {
    return (cond.cuotasAMedida ?? []).map((c) => c.fecha)
  }
  if (cond.sistema === 'al_vencimiento') {
    if (cond.fechaVencimiento) return [cond.fechaVencimiento]
    const meses = MESES_POR_PERIODO[cond.periodicidad] * Math.max(1, cond.cantidadCuotas)
    return [sumarMeses(cond.fechaAlta, meses)]
  }
  const paso = MESES_POR_PERIODO[cond.periodicidad]
  return Array.from({ length: cond.cantidadCuotas }, (_, i) => sumarMeses(cond.fechaAlta, paso * (i + 1)))
}

export interface TramoInput {
  sistema: SistemaDevolucion
  baseDias: BaseDias
  tasa: Tasa
  /** Desde cuándo corre el interés de la primera cuota del tramo. */
  inicio: string
  saldoCentavos: number
  fechas: string[]
  numeroInicial: number
  /** Solo 'a_medida': capital (y, si viene, interés) de cada fecha. */
  aMedida?: Array<{ capitalCentavos: number; interesCentavos?: number | null }> | null
  /** UVA/CER: índice del día del alta. */
  indiceAlta?: number | null
  /** false = el capital no se devuelve en este cronograma (inversión sin vencimiento). */
  devolverCapital?: boolean
}

interface Factor {
  desde: string
  hasta: string
  tasa: TasaPeriodo
  /** Tasa del período (no anual). */
  i: number
}

/**
 * Arma las cuotas de un tramo. Se usa para el cronograma original y para recalcular
 * lo que queda después de una devolución parcial.
 */
export function generarTramo(input: TramoInput, fuentes: FuentesTasas = {}): Cuota[] {
  const n = input.fechas.length
  if (n === 0) throw new Error('El cronograma necesita al menos una cuota')
  if (!Number.isInteger(input.saldoCentavos) || input.saldoCentavos <= 0) {
    throw new Error('El capital tiene que ser mayor a cero')
  }
  let anterior = input.inicio
  for (const f of input.fechas) {
    if (f <= anterior) throw new Error('Las fechas de las cuotas tienen que ir en orden y después del alta')
    anterior = f
  }
  if (input.sistema === 'a_medida') {
    const filas = input.aMedida ?? []
    if (filas.length !== n) throw new Error('Falta el capital de alguna cuota')
    const suma = filas.reduce((s, c) => s + c.capitalCentavos, 0)
    if (suma !== input.saldoCentavos) {
      throw new Error('La suma del capital de las cuotas tiene que dar el capital invertido')
    }
  }

  const factores: Factor[] = input.fechas.map((hasta, k) => {
    const desde = k === 0 ? input.inicio : input.fechas[k - 1]!
    const tasa = tasaDelPeriodo(input.tasa, desde, fuentes)
    const dias = diasDelPeriodo(input.baseDias, desde, hasta)
    return { desde, hasta, tasa, i: ((tasa.tnaPct / 100) * dias) / divisorAnual(input.baseDias, desde) }
  })

  if (input.sistema === 'capitaliza') {
    return cuotaCapitalizada(input, factores, fuentes)
  }

  const devolver = input.devolverCapital !== false
  const cuotas: Cuota[] = []
  let saldo = input.saldoCentavos
  const capitalAleman = Math.floor(input.saldoCentavos / n)

  for (let k = 0; k < n; k += 1) {
    const f = factores[k]!
    const esUltima = k === n - 1
    const interesExacto = saldo * f.i
    const manual = input.sistema === 'a_medida' ? input.aMedida![k]!.interesCentavos : null
    const interes = manual != null ? manual : Math.round(interesExacto)
    let capital: number
    switch (input.sistema) {
      case 'al_vencimiento':
      case 'americano':
        capital = esUltima && devolver ? saldo : 0
        break
      case 'aleman':
        capital = esUltima ? saldo : Math.min(capitalAleman, saldo)
        break
      case 'a_medida':
        capital = input.aMedida![k]!.capitalCentavos
        break
      case 'frances': {
        if (esUltima) {
          capital = saldo
        } else {
          // Cuota pareja con la tasa de este período proyectada a las que faltan (si la tasa cambia, se recalcula).
          const restantes = factores.slice(k).map((x) => {
            const dias = diasDelPeriodo(input.baseDias, x.desde, x.hasta)
            return 1 + ((f.tasa.tnaPct / 100) * dias) / divisorAnual(input.baseDias, x.desde)
          })
          const cuota = cuotaFrancesa(saldo, restantes)
          capital = Math.max(0, Math.min(saldo, Math.round(cuota) - interes))
        }
        break
      }
    }
    saldo -= capital
    cuotas.push({
      numero: input.numeroInicial + k,
      tipo: 'normal',
      fechaVencimiento: f.hasta,
      diasPeriodo: diasDelPeriodo(input.baseDias, f.desde, f.hasta),
      tasaAplicadaPct: f.tasa.tnaPct,
      capitalCentavos: capital,
      interesCentavos: interes,
      ajusteCentavos: 0,
      penalidadCentavos: 0,
      totalCentavos: capital + interes,
      saldoCapitalCentavos: saldo,
      estimada: f.tasa.estimada,
    })
  }

  if (input.tasa.tipo === 'ajustable') return aplicarAjuste(cuotas, input.indiceAlta ?? null, fuentes)
  return cuotas
}

/**
 * Capitaliza: el interés de cada período se suma a la deuda y no se paga.
 * Queda una sola cuota al final con el capital y todo el interés acumulado.
 */
function cuotaCapitalizada(input: TramoInput, factores: Factor[], fuentes: FuentesTasas): Cuota[] {
  let deuda = input.saldoCentavos
  for (const f of factores) deuda += Math.round(deuda * f.i)
  const primero = factores[0]!
  const ultimo = factores.at(-1)!
  const interes = deuda - input.saldoCentavos
  const cuota: Cuota = {
    numero: input.numeroInicial,
    tipo: 'normal',
    fechaVencimiento: ultimo.hasta,
    diasPeriodo: diasDelPeriodo(input.baseDias, primero.desde, ultimo.hasta),
    tasaAplicadaPct: primero.tasa.tnaPct,
    capitalCentavos: input.saldoCentavos,
    interesCentavos: interes,
    ajusteCentavos: 0,
    penalidadCentavos: 0,
    totalCentavos: deuda,
    saldoCapitalCentavos: 0,
    estimada: factores.some((f) => f.tasa.estimada),
  }
  if (input.tasa.tipo === 'ajustable') return aplicarAjuste([cuota], input.indiceAlta ?? null, fuentes)
  return [cuota]
}

/** Deuda de una inversión que capitaliza a una fecha (capital + intereses sumados período a período). */
export function deudaCapitalizadaAl(
  cond: Pick<CondicionesInversion, 'capitalCentavos' | 'fechaAlta' | 'periodicidad' | 'tasa' | 'baseDias'>,
  fecha: string,
  fuentes: FuentesTasas = {},
): number {
  const paso = MESES_POR_PERIODO[cond.periodicidad]
  let deuda = cond.capitalCentavos
  let desde = cond.fechaAlta
  for (let k = 1; k < 1000; k += 1) {
    const hasta = sumarMeses(cond.fechaAlta, paso * k)
    const corte = hasta > fecha ? fecha : hasta
    const tasa = tasaDelPeriodo(cond.tasa, desde, fuentes)
    const interes = interesSimple(deuda, tasa.tnaPct, cond.baseDias, desde, corte)
    if (hasta > fecha) return Math.round(deuda + interes)
    deuda += Math.round(interes)
    desde = hasta
  }
  return deuda
}

/**
 * Cuota constante para que el saldo llegue a cero, con un factor (1 + i) por período.
 * C = S · Π f / Σ_j Π_{l>j} f
 */
export function cuotaFrancesa(saldo: number, factores: number[]): number {
  const producto = factores.reduce((p, f) => p * f, 1)
  let suma = 0
  for (let j = 0; j < factores.length; j += 1) {
    suma += factores.slice(j + 1).reduce((p, f) => p * f, 1)
  }
  return (saldo * producto) / suma
}

/** UVA/CER: el capital y el interés de cada cuota se actualizan por el índice del día de la cuota. */
export function aplicarAjuste(cuotas: Cuota[], indiceAlta: number | null, fuentes: FuentesTasas): Cuota[] {
  if (!indiceAlta || indiceAlta <= 0) throw new Error('Falta el valor del índice del día del alta')
  if (!fuentes.indice) throw new Error('No hay valores del índice. Actualizá las tasas del BCRA.')
  return cuotas.map((c) => {
    const idx = fuentes.indice!(c.fechaVencimiento)
    if (!idx) throw new Error('No hay valores del índice. Actualizá las tasas del BCRA.')
    const r = idx.valor / indiceAlta
    const ajuste = Math.round(c.capitalCentavos * (r - 1))
    const interes = Math.round(c.interesCentavos * r)
    return {
      ...c,
      interesCentavos: interes,
      ajusteCentavos: ajuste,
      totalCentavos: c.capitalCentavos + ajuste + interes,
      estimada: c.estimada || idx.estimada,
      indiceValor: idx.valor,
    }
  })
}

/** Cronograma completo de una inversión nueva. */
export function generarCronograma(
  cond: CondicionesInversion,
  fuentes: FuentesTasas = {},
  indiceAlta: number | null = null,
  opciones: OpcionesCronograma = {},
): Cuota[] {
  if (cond.tasa.tipo === 'ajustable' && cond.moneda !== 'ARS') {
    throw new Error('UVA y CER solo se usan en inversiones en pesos')
  }
  if (cond.sinVencimiento && cond.sistema !== 'americano' && cond.sistema !== 'capitaliza') {
    throw new Error('Sin vencimiento solo se usa cuando se pagan los intereses o cuando capitaliza')
  }
  // Capitaliza sin vencimiento: no hay nada que pagar hasta que se pida la devolución.
  if (cond.sinVencimiento && cond.sistema === 'capitaliza') return []
  const fechas = fechasDeCuotas(cond, opciones)
  if (cond.sinVencimiento && fechas.length === 0) return []
  return generarTramo(
    {
      sistema: cond.sistema,
      baseDias: cond.baseDias,
      tasa: cond.tasa,
      inicio: cond.fechaAlta,
      saldoCentavos: cond.capitalCentavos,
      fechas,
      numeroInicial: 1,
      devolverCapital: !cond.sinVencimiento,
      aMedida: cond.cuotasAMedida?.map((c) => ({ capitalCentavos: c.capitalCentavos, interesCentavos: c.interesCentavos ?? null })) ?? null,
      indiceAlta,
    },
    fuentes,
  )
}

export interface TotalesCronograma {
  capitalCentavos: number
  interesCentavos: number
  ajusteCentavos: number
  penalidadCentavos: number
  totalCentavos: number
}

export function totalesDe(cuotas: readonly Cuota[]): TotalesCronograma {
  const vivas = cuotas.filter((c) => !c.anulada)
  const sum = (f: (c: Cuota) => number) => vivas.reduce((s, c) => s + f(c), 0)
  return {
    capitalCentavos: sum((c) => c.capitalCentavos),
    interesCentavos: sum((c) => c.interesCentavos),
    ajusteCentavos: sum((c) => c.ajusteCentavos),
    penalidadCentavos: sum((c) => c.penalidadCentavos),
    totalCentavos: sum((c) => c.totalCentavos),
  }
}

/** Lo que BACAR tiene que pagar de una cuota (descontando lo que se renovó). */
export function aPagarDeCuota(c: Cuota): number {
  if (c.anulada) return 0
  return Math.max(0, c.totalCentavos - (c.renovadaCentavos ?? 0))
}
