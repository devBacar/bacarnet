/**
 * Relación entre ausencias y horas extra de un área, con un umbral de absorción:
 *   horasExtra = a + b · max(0, horasAusencia − k)
 * k es la cantidad de horas de ausencia que el área cubre sin pagar horas extra adicionales.
 * Se elige k probando percentiles de los datos y quedándose con el de menor error.
 */

export interface AjusteUmbral {
  a: number
  b: number
  k: number
  r2: number
  correlacion: number
}

/** Percentil con interpolación lineal (mismo criterio que numpy.percentile por defecto). */
export function percentil(valores: number[], p: number): number {
  const v = [...valores].sort((x, y) => x - y)
  if (v.length === 0) return 0
  const pos = (p / 100) * (v.length - 1)
  const i = Math.floor(pos)
  const f = pos - i
  return i + 1 < v.length ? v[i] + f * (v[i + 1] - v[i]) : v[i]
}

function media(v: number[]): number {
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0
}

function regresionLineal(x: number[], y: number[]): { a: number; b: number } {
  const mx = media(x)
  const my = media(y)
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < x.length; i += 1) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) ** 2
  }
  if (sxx === 0) return { a: my, b: 0 }
  const b = sxy / sxx
  return { a: my - b * mx, b }
}

export function correlacion(x: number[], y: number[]): number {
  const mx = media(x)
  const my = media(y)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < x.length; i += 1) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) ** 2
    syy += (y[i] - my) ** 2
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0
}

/** Ajusta el modelo con umbral. `ausencias` y `horasExtra` son series mensuales del mismo largo. */
export function ajustarUmbral(ausencias: number[], horasExtra: number[]): AjusteUmbral {
  const candidatos = [0]
  for (let p = 5; p < 80; p += 2.5) candidatos.push(percentil(ausencias, p))

  let mejor: { sse: number; a: number; b: number; k: number } | null = null
  for (const k of candidatos) {
    const h = ausencias.map((x) => Math.max(0, x - k))
    const { a, b } = regresionLineal(h, horasExtra)
    if (b < 0) continue
    let sse = 0
    for (let i = 0; i < h.length; i += 1) sse += (a + b * h[i] - horasExtra[i]) ** 2
    if (!mejor || sse < mejor.sse) mejor = { sse, a, b, k }
  }
  const my = media(horasExtra)
  const sst = horasExtra.reduce((s, y) => s + (y - my) ** 2, 0)
  if (!mejor) return { a: my, b: 0, k: 0, r2: 0, correlacion: correlacion(ausencias, horasExtra) }
  return {
    a: mejor.a,
    b: mejor.b,
    k: mejor.k,
    r2: sst > 0 ? 1 - mejor.sse / sst : 0,
    correlacion: correlacion(ausencias, horasExtra),
  }
}
