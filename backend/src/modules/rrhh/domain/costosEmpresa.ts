import type { ResultadoResumen } from './resumenMensual.js'

/**
 * Cuánto le cuesta a la empresa cada peso pagado en horas extra y cuánto cuesta una persona más.
 * Todo sale de los recibos de Salario: no hay porcentajes inventados.
 *
 * Costo de $1 de hora extra = 1
 *   + contribuciones patronales (pendiente de contribuciones vs. remunerativo entre todos los recibos del mes)
 *   + provisiones de Salario (aguinaldo y despidos, misma regresión)
 *   + contribuciones sobre el aguinaldo cuando se paga (contribuciones / 12)
 *   + mayor pago de vacaciones (art. 155 LCT: el promedio de horas extra habituales sube el día de vacaciones)
 */
export interface FactoresCosto {
  /** Mes de los recibos usado para medir las tasas (no se usan jun, jul, dic ni ene: tienen aguinaldo). */
  mesBase: string
  contribuciones: number
  provisiones: number
  cargasAguinaldo: number
  vacaciones: number
  /** Días de vacaciones promedio por persona (LCT art. 150), para el efecto en vacaciones. */
  diasVacacionesPromedio: number
  /** Multiplicador final: costo empresa = monto liquidado × total. */
  total: number
  /** Si no se pudo medir con los recibos, se usan valores de referencia (se muestra un aviso). */
  medido: boolean
}

/** Valores de referencia si el backup no trae recibos suficientes (medidos en sep-26). */
const CONTRIBUCIONES_REFERENCIA = 0.2655
const PROVISIONES_REFERENCIA = 0.0982
const MESES_CON_AGUINALDO = new Set(['06', '07', '12', '01'])
const MINIMO_RECIBOS = 50

function pendiente(xs: number[], ys: number[]): number {
  const n = xs.length
  const mx = xs.reduce((s, x) => s + x, 0) / n
  const my = ys.reduce((s, y) => s + y, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  return den > 0 ? num / den : 0
}

/** Tasas medidas en un mes: pendiente de contribuciones y provisiones contra el remunerativo, recibo por recibo. */
export function tasasDelMes(resultado: ResultadoResumen, mes: string): { contribuciones: number; provisiones: number; recibos: number } {
  const rem: number[] = []
  const contrib: number[] = []
  const prov: number[] = []
  for (const p of resultado.personas) {
    const m = p.meses[mes]
    if (!m || m.totales.rem <= 0) continue
    rem.push(m.totales.rem)
    contrib.push(m.totales.contrib)
    prov.push(m.totales.prov)
  }
  if (rem.length < MINIMO_RECIBOS) return { contribuciones: 0, provisiones: 0, recibos: rem.length }
  return { contribuciones: pendiente(rem, contrib), provisiones: pendiente(rem, prov), recibos: rem.length }
}

export function calcularFactores(resultado: ResultadoResumen, diasVacacionesPromedio: number): FactoresCosto {
  const candidatos = [...resultado.meses].reverse().filter((m) => !MESES_CON_AGUINALDO.has(m.slice(4, 6)))
  let mesBase = ''
  let contribuciones = CONTRIBUCIONES_REFERENCIA
  let provisiones = PROVISIONES_REFERENCIA
  let medido = false
  for (const mes of candidatos.slice(0, 4)) {
    const t = tasasDelMes(resultado, mes)
    // Una tasa fuera de rango indica un mes atípico (ajustes, retroactivos): se prueba el anterior.
    if (t.recibos >= MINIMO_RECIBOS && t.contribuciones > 0.15 && t.contribuciones < 0.4 && t.provisiones > 0.05 && t.provisiones < 0.15) {
      mesBase = mes
      contribuciones = t.contribuciones
      provisiones = t.provisiones
      medido = true
      break
    }
  }
  const cargasAguinaldo = contribuciones / 12
  const vacaciones = (diasVacacionesPromedio / 300) * (1 + contribuciones)
  return {
    mesBase,
    contribuciones,
    provisiones,
    cargasAguinaldo,
    vacaciones,
    diasVacacionesPromedio,
    total: 1 + contribuciones + provisiones + cargasAguinaldo + vacaciones,
    medido,
  }
}

export interface CostoPersonaArea {
  /** Costo total por mes de una persona del área sin sus horas extra (recibo completo + provisiones + cargas del aguinaldo). */
  costoMes: number
  /** De ese costo: no remunerativo (viáticos, sumas fijas). */
  noRemunerativo: number
  /** Parte del mes que una persona trabaja de verdad (descontando vacaciones y licencias del área). */
  productividad: number
  /** Recibos usados. */
  recibos: number
}

/**
 * Costo de una persona más en el área, con el costo laboral de Salario (COSTOS) del mes base.
 * Se usa el promedio del área (incluye antigüedad), así que para una persona nueva es un poco más alto que el real.
 */
export function costoPersonaArea(
  resultado: ResultadoResumen,
  cc: number,
  mesBase: string,
  factores: FactoresCosto,
  excluir: Set<number>,
): CostoPersonaArea {
  const recibos: { costo: number; norem: number }[] = []
  const rems: number[] = []
  for (const p of resultado.personas) {
    const m = p.meses[mesBase]
    if (!m || m.cc !== cc || m.totales.rem <= 0 || m.totales.costo <= 0 || excluir.has(p.legajo)) continue
    rems.push(m.totales.rem)
  }
  rems.sort((a, b) => a - b)
  const mediana = rems.length ? rems[Math.floor(rems.length / 2)] : 0
  for (const p of resultado.personas) {
    const m = p.meses[mesBase]
    if (!m || m.cc !== cc || m.totales.rem <= 0 || m.totales.costo <= 0 || excluir.has(p.legajo)) continue
    // Recibos de medio mes (ingresos, egresos, licencias sin goce) bajarían el promedio.
    if (m.totales.rem < mediana * 0.5) continue
    const he = m.horas.he50.monto + m.horas.he100.monto + m.horas.fer.monto + m.horas.comp.monto + m.horas.noct.monto
    const sinHe =
      m.totales.costo +
      m.totales.prov -
      he * (1 + factores.contribuciones + factores.provisiones) +
      (m.totales.rem - he) * factores.cargasAguinaldo
    recibos.push({ costo: sinHe, norem: m.totales.norem })
  }
  // Productividad: 1 − días de ausencia / días del mes, promedio de los últimos 12 meses del área.
  const ultimos = resultado.meses.slice(-12)
  let ausentes = 0
  let posibles = 0
  for (const r of resultado.centrosCosto) {
    if (r.cc !== cc || !ultimos.includes(r.mes)) continue
    ausentes += Object.values(r.ausencias).reduce((s, d) => s + d, 0)
    posibles += r.dotacion * 30
  }
  const productividad = posibles > 0 ? Math.min(1, Math.max(0.8, 1 - ausentes / posibles)) : 0.93
  const n = recibos.length
  return {
    costoMes: n ? recibos.reduce((s, r) => s + r.costo, 0) / n : 0,
    noRemunerativo: n ? recibos.reduce((s, r) => s + r.norem, 0) / n : 0,
    productividad,
    recibos: n,
  }
}

/** Costo real de una hora de personal eventual (jornal) en el mes base, con todo el recibo. */
export function costoHoraEventual(resultado: ResultadoResumen, ccs: number[], mesBase: string, factores: FactoresCosto): number {
  let costo = 0
  let horas = 0
  for (const r of resultado.centrosCosto) {
    if (r.mes !== mesBase || !ccs.includes(r.cc)) continue
    costo += r.totales.costo + r.totales.prov + r.totales.rem * factores.cargasAguinaldo
    horas += r.horas.jornal.hs
  }
  return horas > 0 ? costo / horas : 0
}
