export const DEFAULT_CALENDAR_TIMEZONE = 'America/Argentina/Buenos_Aires'

const FLOATING_LOCAL_DATETIME_RE =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

/** Argentina (piloto): offset fijo para comparar rangos flotantes sin reparsear como UTC. */
export const ARGENTINA_OFFSET = '-03:00'

function normalizeFloatingLocal(value: string): string {
  const trimmed = value.trim()
  const match = FLOATING_LOCAL_DATETIME_RE.exec(trimmed)
  if (!match) return trimmed
  const seconds = match[4] ?? '00'
  return `${match[1]}T${match[2]}:${match[3]}:${seconds}`
}

/**
 * Gemini/JSON a veces agrega Z a horas locales (ej. 07:00:00.000Z = 7am AR, no UTC).
 * Solo usar en caminos de escritura al calendario, no al leer ISO con offset real.
 */
export function stripUtcSuffixAsLocalFloating(value: string): string | null {
  const trimmed = value.trim()
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?Z$/i.exec(trimmed)
  if (!match) return null
  return normalizeFloatingLocal(match[1])
}

/** Normaliza datetime de entrada del asistente (plan, borrador, confirmación). */
export function parseAssistantCalendarDateTime(value: string, timeZone: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Fecha/hora inválida para el calendario.')
  }
  const zAsLocal = stripUtcSuffixAsLocalFloating(trimmed)
  if (zAsLocal) return zAsLocal
  return toFloatingDateTimeInZone(trimmed, timeZone)
}

function hasExplicitOffset(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value.trim())
}

/** Convierte ISO con offset/Z a hora local flotante en la zona indicada (sin offset en el string). */
export function toFloatingDateTimeInZone(value: string, timeZone: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Fecha/hora inválida para el calendario.')
  }

  // Sin offset: ya es hora de pared en la zona objetivo (ej. salida de extractActionPlan).
  if (!hasExplicitOffset(trimmed) && FLOATING_LOCAL_DATETIME_RE.test(trimmed)) {
    return normalizeFloatingLocal(trimmed)
  }

  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Fecha/hora inválida para el calendario.')
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00'

  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}

export function toCalendarDateTime(value: string, timeZone: string): { dateTime: string; timeZone: string } {
  return {
    dateTime: parseAssistantCalendarDateTime(value, timeZone),
    timeZone,
  }
}

/** Convierte datetime flotante (sin offset) a epoch ms asumiendo zona Argentina. */
export function floatingDateTimeToMs(
  dateTime: string,
  timeZone: string = DEFAULT_CALENDAR_TIMEZONE,
): number {
  const floating = toFloatingDateTimeInZone(dateTime, timeZone)
  const offset = timeZone === DEFAULT_CALENDAR_TIMEZONE ? ARGENTINA_OFFSET : ARGENTINA_OFFSET
  return new Date(`${floating}${offset}`).getTime()
}

export function floatingRangeToMs(
  startDateTime: string,
  endDateTime: string,
  timeZone: string = DEFAULT_CALENDAR_TIMEZONE,
): { startMs: number; endMs: number } {
  return {
    startMs: floatingDateTimeToMs(startDateTime, timeZone),
    endMs: floatingDateTimeToMs(endDateTime, timeZone),
  }
}

export function addDaysIso(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00`)
  base.setDate(base.getDate() + days)
  return base.toISOString().slice(0, 10)
}

export function todayInTimeZone(timeZone = DEFAULT_CALENDAR_TIMEZONE): string {
  return toFloatingDateTimeInZone(new Date().toISOString(), timeZone).slice(0, 10)
}

/** Límite de día en ISO UTC para consultas a Google Calendar (medianoche AR → UTC). */
export function calendarDayBoundaryIso(dateIso: string, boundary: 'start' | 'end'): string {
  const time = boundary === 'start' ? '00:00:00' : '23:59:59'
  return new Date(`${dateIso}T${time}${ARGENTINA_OFFSET}`).toISOString()
}

export function formatFloatingTime(value: string, timeZone = DEFAULT_CALENDAR_TIMEZONE): string {
  const floating = toFloatingDateTimeInZone(value, timeZone)
  return floating.slice(11, 16)
}

export function formatFloatingTimeRange(
  start: string,
  end: string | null | undefined,
  timeZone = DEFAULT_CALENDAR_TIMEZONE,
): string {
  const startTime = formatFloatingTime(start, timeZone)
  if (!end) return startTime
  const endTime = formatFloatingTime(end, timeZone)
  return startTime === endTime ? startTime : `${startTime}–${endTime}`
}

/** Ej. "martes 9 de septiembre" */
export function formatIsoDateReadableSpanish(
  dateIso: string,
  timeZone = DEFAULT_CALENDAR_TIMEZONE,
): string {
  const date = new Date(`${dateIso}T12:00:00${ARGENTINA_OFFSET}`)
  const formatted = date.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

export function formatIsoDateRangeReadableSpanish(
  dateFrom: string,
  dateTo: string,
  timeZone = DEFAULT_CALENDAR_TIMEZONE,
): string {
  if (dateFrom === dateTo) {
    return formatIsoDateReadableSpanish(dateFrom, timeZone)
  }
  return `del ${formatIsoDateReadableSpanish(dateFrom, timeZone)} al ${formatIsoDateReadableSpanish(dateTo, timeZone)}`
}
