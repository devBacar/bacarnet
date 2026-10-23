/** Fechas de negocio como 'YYYY-MM-DD'. Todas las cuentas se hacen en UTC para no depender del huso. */

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

export function esYmd(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const m = YMD.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

function partes(ymd: string): [number, number, number] {
  const m = YMD.exec(ymd)
  if (!m) throw new Error(`Fecha inválida: ${ymd}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function aYmd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function ultimoDiaDelMes(anio: number, mes1: number): number {
  return new Date(Date.UTC(anio, mes1, 0)).getUTCDate()
}

/** Suma meses respetando el día (31/01 + 1 mes = 28 o 29/02). */
export function sumarMeses(ymd: string, meses: number): string {
  const [anio, mes, dia] = partes(ymd)
  const total = anio * 12 + (mes - 1) + meses
  const nuevoAnio = Math.floor(total / 12)
  const nuevoMes = (total % 12) + 1
  const d = Math.min(dia, ultimoDiaDelMes(nuevoAnio, nuevoMes))
  return `${nuevoAnio}-${String(nuevoMes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function sumarDias(ymd: string, dias: number): string {
  const [anio, mes, dia] = partes(ymd)
  return aYmd(new Date(Date.UTC(anio, mes - 1, dia + dias)))
}

/** Días de calendario entre dos fechas (b − a). */
export function diasEntre(a: string, b: string): number {
  const [a1, a2, a3] = partes(a)
  const [b1, b2, b3] = partes(b)
  return Math.round((Date.UTC(b1, b2 - 1, b3) - Date.UTC(a1, a2 - 1, a3)) / 86_400_000)
}

/** Días con meses de 30 (convención 30E/360). */
export function dias30360(a: string, b: string): number {
  const [y1, m1, d1raw] = partes(a)
  const [y2, m2, d2raw] = partes(b)
  const d1 = Math.min(d1raw, 30)
  const d2 = Math.min(d2raw, 30)
  return 360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1)
}

export function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0
}

export function anioDe(ymd: string): number {
  return partes(ymd)[0]
}

export function compararYmd(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 'YYYY-MM-DD' → 'D/M/AAAA' para textos. */
export function fechaCorta(ymd: string): string {
  const [anio, mes, dia] = partes(ymd)
  return `${dia}/${mes}/${anio}`
}

/** Fecha de hoy en Argentina, 'YYYY-MM-DD'. */
export function hoyArgentina(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}
