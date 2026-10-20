const NOM = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export const mesLargo = (m: string): string => `${NOM[+m.slice(5) - 1]} ${m.slice(0, 4)}`
export const mesCorto = (m: string): string => `${NOM[+m.slice(5) - 1].slice(0, 3)} ${m.slice(2, 4)}`

export const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
export const nf1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

/** Millones de pesos: "$ 12 M". */
export const M = (v: number): string => `${v < 0 ? '−' : ''}$ ${nf.format(Math.abs(Math.round((v || 0) / 1e6)))} M`
export const US = (v: number): string => `US$ ${nf.format(Math.round(v / 1e3))} mil`

export const pct = (v: number, d = 0): string => (isFinite(v) ? `${nf1.format(+(v * 100).toFixed(d))}%` : '—')
export const signo = (v: number | null | undefined): string =>
  v != null && isFinite(v) ? `${v >= 0 ? '+' : '−'}${pct(Math.abs(v))}` : '—'

/** Precio unitario: "$ 1.234" o "$ 12,5 M". */
export const precio = (v: number | null | undefined): string =>
  v == null ? '—' : `$ ${v >= 1e7 ? `${nf1.format(v / 1e6)} M` : nf.format(v)}`

/** Nombres propios en mayúscula inicial ("FILMEC S.A." -> "Filmec S.A."). */
export const tit = (s: unknown): string =>
  String(s)
    .trim()
    .toLowerCase()
    .replace(/(^|\s|\.|-|\/)(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(S\.?a\.?|S\.?r\.?l\.?|Sacif|S\.?a\.?u\.?)$/i, (x) => x.toUpperCase())
    .replace(/\.+$/, '')

export const suma = <T,>(arr: readonly T[], f: (x: T) => number | null | undefined): number =>
  arr.reduce((s, x) => s + (f(x) || 0), 0)

/** Mismo mes, un año antes. */
export const menos12 = (m: string): string => `${+m.slice(0, 4) - 1}${m.slice(4)}`

export const difMeses = (a: string, b: string): number => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5) - +a.slice(5))
