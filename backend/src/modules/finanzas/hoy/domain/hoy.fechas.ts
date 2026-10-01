import { dateKeyInArgentina } from '../../agenda/domain/vencimiento.alert.js'

const ZONA = 'America/Argentina/Buenos_Aires'

export function fechaHoyArgentina(now: Date): string {
  return dateKeyInArgentina(now)
}

export function sumarDias(ymd: string, dias: number): string {
  const date = new Date(`${ymd}T12:00:00-03:00`)
  date.setUTCDate(date.getUTCDate() + dias)
  return dateKeyInArgentina(date)
}

export function diasEntre(desdeYmd: string, hastaYmd: string): number {
  const desde = Date.parse(`${desdeYmd}T12:00:00-03:00`)
  const hasta = Date.parse(`${hastaYmd}T12:00:00-03:00`)
  return Math.round((hasta - desde) / 86_400_000)
}

export function esDiaHabil(ymd: string): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    weekday: 'short',
  }).format(new Date(`${ymd}T12:00:00-03:00`))
  return weekday !== 'Sat' && weekday !== 'Sun'
}

/** Incluye hoy si es hábil. Sábado y domingo no cuentan; no resta feriados. */
export function proximosDiasHabiles(hoy: string, cantidad: number): string[] {
  const dias: string[] = []
  let cursor = hoy
  while (dias.length < cantidad) {
    if (esDiaHabil(cursor)) dias.push(cursor)
    cursor = sumarDias(cursor, 1)
  }
  return dias
}

/** El día hábil que sigue. Sábado y domingo no cuentan; no resta feriados, igual que la semana. */
export function mananaHabil(hoy: string): string {
  return proximosDiasHabiles(sumarDias(hoy, 1), 1)[0] ?? sumarDias(hoy, 1)
}

function parteFecha(now: Date, type: 'weekday' | 'day' | 'month'): string {
  const partes = new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).formatToParts(now)
  return partes.find((parte) => parte.type === type)?.value ?? ''
}

export function saludoDelDia(now: Date): string {
  const weekday = parteFecha(now, 'weekday')
  const day = parteFecha(now, 'day')
  const month = parteFecha(now, 'month')
  return `Buen día. Hoy es ${weekday} ${day} de ${month}.`
}

export function etiquetaDia(ymd: string): string {
  const date = new Date(`${ymd}T12:00:00-03:00`)
  const weekday = new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA,
    weekday: 'long',
  }).format(date)
  const [, mes, dia] = ymd.split('-')
  const nombre = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  return `${nombre} ${Number(dia)}/${Number(mes)}`
}

export function nombreDia(ymd: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA,
    weekday: 'long',
  }).format(new Date(`${ymd}T12:00:00-03:00`))
}

export function textoHaceDias(dias: number, prefijoVencio: boolean): string {
  const cantidad = dias === 1 ? '1 día' : `${dias} días`
  return prefijoVencio ? `Venció hace ${cantidad}` : `Hace ${cantidad}`
}

export function formatoPesos(centavos: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centavos / 100)
}

/** $5 M cuando el monto es de millones; si no, el peso completo. */
export function formatoPesosCorto(centavos: number): string {
  const pesos = Math.abs(centavos) / 100
  if (pesos >= 1_000_000) {
    const millones = pesos / 1_000_000
    const texto = Number.isInteger(millones)
      ? String(millones)
      : millones.toLocaleString('es-AR', { maximumFractionDigits: 1 })
    return `$${texto} M`
  }
  return formatoPesos(centavos)
}
