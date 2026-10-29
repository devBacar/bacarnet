const nfEntero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const nfPct = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })

/** Conteo entero: 48.350 */
export function entero(n: number): string {
  return nfEntero.format(Math.round(n))
}

/** Porcentaje es-AR: 73,5% (n en escala 0–100). */
export function pct(n: number): string {
  return `${nfPct.format(n)}%`
}

/** Timestamp del snapshot → "14:30". */
export function horaActualizado(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

/** "2026-11" o ISO → "noviembre 2026". Si no parsea, devuelve el texto original. */
export function mesNombre(valor: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(valor.trim())
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 12))
    return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  }
  const d = new Date(valor)
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('es-AR', {
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Argentina/Buenos_Aires',
    })
  }
  return valor
}

/** YYYY-MM-DD → dd/mm/yyyy. */
export function fechaCorta(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim())
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const d = new Date(ymd)
  if (Number.isNaN(d.getTime())) return ymd
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}
