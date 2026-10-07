import type { ResultadoResumen } from './resumenMensual.js'

/**
 * Horas extra pactadas: acuerdos individuales por los que una persona cobra siempre la misma cantidad
 * de horas extra. No se pueden reducir con las medidas del plan, así que se muestran aparte.
 *
 * Detección (la confirma RRHH): en el año del último mes liquidado, el mismo par de horas
 * (50% y 100%, con ±1 h) en al menos el 75% de los meses con horas extra, y además
 *  - al menos 6 meses seguidos iguales, o
 *  - al menos 3 meses seguidos iguales sumando 15 h o más por mes.
 */

export type EstadoPactada = 'detectada' | 'confirmada'

export interface PersonaPactada {
  legajo: number
  nombre: string
  cc: number
  puesto: string
  horas50: number
  horas100: number
  /** Meses del año con el mismo par de horas. */
  mesesIguales: number
  mesesConHoras: number
  estado: EstadoPactada
  /** Horas extra (50% + 100%) del año. */
  horasAnio: number
}

export interface ConfigPactadas {
  confirmadas: number[]
  descartadas: number[]
}

export const CONFIG_PACTADAS_VACIA: ConfigPactadas = { confirmadas: [], descartadas: [] }

const TOLERANCIA_HORAS = 1
const PROPORCION_MINIMA = 0.75
const MESES_SEGUIDOS_LARGO = 6
const MESES_SEGUIDOS_CORTO = 3
const HORAS_MINIMAS_CORTO = 15

function parecido(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) <= TOLERANCIA_HORAS && Math.abs(a[1] - b[1]) <= TOLERANCIA_HORAS
}

export function detectarPactadas(
  resultado: ResultadoResumen,
  config: ConfigPactadas,
  nombrePuesto: (puesto: number) => string,
): PersonaPactada[] {
  const ultimo = resultado.ultimoMes
  if (!ultimo) return []
  const anio = ultimo.slice(0, 4)
  const meses = resultado.meses.filter((m) => m.startsWith(anio) && m <= ultimo)
  const descartadas = new Set(config.descartadas)
  const confirmadas = new Set(config.confirmadas)
  const out: PersonaPactada[] = []

  for (const p of resultado.personas) {
    if (descartadas.has(p.legajo)) continue
    const pares: [number, number][] = []
    for (const m of meses) {
      const x = p.meses[m]
      if (!x) continue
      const par: [number, number] = [x.horas.he50.hs, x.horas.he100.hs]
      if (par[0] + par[1] > 0) pares.push(par)
    }
    if (pares.length === 0) continue
    // El par que más se repite.
    let mejor = pares[0]
    let iguales = 0
    for (const candidato of pares) {
      const n = pares.filter((q) => parecido(candidato, q)).length
      if (n > iguales) {
        iguales = n
        mejor = candidato
      }
    }
    let racha = 0
    let rachaMax = 0
    for (const q of pares) {
      racha = parecido(mejor, q) ? racha + 1 : 0
      rachaMax = Math.max(rachaMax, racha)
    }
    const detectada =
      pares.length >= MESES_SEGUIDOS_CORTO &&
      iguales / pares.length >= PROPORCION_MINIMA &&
      (rachaMax >= MESES_SEGUIDOS_LARGO || (rachaMax >= MESES_SEGUIDOS_CORTO && mejor[0] + mejor[1] >= HORAS_MINIMAS_CORTO))
    if (!detectada && !confirmadas.has(p.legajo)) continue
    out.push({
      legajo: p.legajo,
      nombre: p.nombre.trim(),
      cc: p.meses[ultimo]?.cc ?? p.cc,
      puesto: nombrePuesto(p.puesto),
      horas50: mejor[0],
      horas100: mejor[1],
      mesesIguales: iguales,
      mesesConHoras: pares.length,
      estado: confirmadas.has(p.legajo) ? 'confirmada' : 'detectada',
      horasAnio: Math.round(pares.reduce((s, q) => s + q[0] + q[1], 0) * 10) / 10,
    })
  }
  return out.sort((a, b) => b.horas50 + b.horas100 - (a.horas50 + a.horas100))
}

/** Horas y monto pactados de una persona en un mes: lo que cobró hasta el tope de su acuerdo. */
export function pactadoDelMes(
  resultado: ResultadoResumen,
  pactada: PersonaPactada,
  mes: string,
): { horas: number; monto: number; cc: number } | null {
  const p = resultado.personas.find((x) => x.legajo === pactada.legajo)
  const m = p?.meses[mes]
  if (!m) return null
  const h50 = Math.min(m.horas.he50.hs, pactada.horas50)
  const h100 = Math.min(m.horas.he100.hs, pactada.horas100)
  const v50 = m.horas.he50.hs > 0 ? m.horas.he50.monto / m.horas.he50.hs : 0
  const v100 = m.horas.he100.hs > 0 ? m.horas.he100.monto / m.horas.he100.hs : 0
  return { horas: h50 + h100, monto: h50 * v50 + h100 * v100, cc: m.cc }
}
