import { DEFAULT_CALENDAR_TIMEZONE } from '../assistant-actions/calendarDateTime.js'

export const HELPDESK_SLOT_TIMEZONE = DEFAULT_CALENDAR_TIMEZONE
export const HELPDESK_MEETING_DURATION_MINUTES = 45
export const HELPDESK_BUSINESS_HOUR_START = 9
export const HELPDESK_BUSINESS_HOUR_END = 18
export const HELPDESK_BUSINESS_DAYS_COUNT = 5

const FECHA_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/
const HORA_RE = /^(\d{2}):00$/

export interface HelpdeskSlotLabel {
  fecha: string
  hora: string
}

function startOfLocalDayInZone(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  const d = parts.find((p) => p.type === 'day')?.value ?? '01'
  return localWallTimeToUtcDate(`${y}-${m}-${d}T00:00:00`, timeZone)
}

function localWallTimeToUtcDate(floatingLocal: string, timeZone: string): Date {
  const [datePart, timePart] = floatingLocal.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute, second] = timePart.split(':').map(Number)
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second ?? 0)
  let guess = utcGuess
  for (let i = 0; i < 3; i++) {
    const offsetMs = getTimeZoneOffsetMs(new Date(guess), timeZone)
    const adjusted = utcGuess - offsetMs
    if (adjusted === guess) break
    guess = adjusted
  }
  return new Date(guess)
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(tz)
  if (!match) return 0
  const sign = match[1] === '-' ? -1 : 1
  const hours = Number(match[2])
  const minutes = Number(match[3] ?? '0')
  return sign * (hours * 60 + minutes) * 60 * 1000
}

function formatFechaLabel(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date)
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970'
  return `${day}/${month}/${year}`
}

function isWeekendInZone(date: Date, timeZone: string): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date)
  return weekday === 'Sat' || weekday === 'Sun'
}

export function collectBusinessDaysFromTomorrow(input: {
  semanaOffset: number
  count?: number
  now?: Date
  timeZone?: string
}): Date[] {
  const timeZone = input.timeZone ?? HELPDESK_SLOT_TIMEZONE
  const count = input.count ?? HELPDESK_BUSINESS_DAYS_COUNT
  const now = input.now ?? new Date()
  const offsetWeeks = Number.isFinite(input.semanaOffset) ? Math.max(0, input.semanaOffset) : 0

  let cursor = startOfLocalDayInZone(now, timeZone)
  cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  cursor = new Date(cursor.getTime() + offsetWeeks * 7 * 24 * 60 * 60 * 1000)

  const days: Date[] = []
  while (days.length < count) {
    if (!isWeekendInZone(cursor, timeZone)) {
      days.push(new Date(cursor))
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  }
  return days
}

export function buildInitialAvailabilitySlots(semanaOffset: number): HelpdeskSlotLabel[] {
  const days = collectBusinessDaysFromTomorrow({ semanaOffset })
  const slots: HelpdeskSlotLabel[] = []
  for (const day of days) {
    const fecha = formatFechaLabel(day, HELPDESK_SLOT_TIMEZONE)
    for (let hour = HELPDESK_BUSINESS_HOUR_START; hour < HELPDESK_BUSINESS_HOUR_END; hour++) {
      const hh = String(hour).padStart(2, '0')
      slots.push({ fecha, hora: `${hh}:00` })
    }
  }
  return slots
}

export function parseSlotLabels(fecha: string, hora: string): { startISO: string; endISO: string } {
  const fechaMatch = FECHA_RE.exec(fecha.trim())
  const horaMatch = HORA_RE.exec(hora.trim())
  if (!fechaMatch || !horaMatch) {
    throw new Error('fecha u hora inválidas')
  }
  const [, dd, mm, yyyy] = fechaMatch
  const [, hh] = horaMatch
  const startFloating = `${yyyy}-${mm}-${dd}T${hh}:00:00`
  const start = localWallTimeToUtcDate(startFloating, HELPDESK_SLOT_TIMEZONE)
  const end = new Date(start.getTime() + HELPDESK_MEETING_DURATION_MINUTES * 60 * 1000)
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}

export function slotRangeToQueryWindow(slots: HelpdeskSlotLabel[]): {
  timeMinISO: string
  timeMaxISO: string
} {
  if (slots.length === 0) {
    throw new Error('No hay slots para consultar disponibilidad')
  }
  const first = parseSlotLabels(slots[0].fecha, slots[0].hora)
  const last = parseSlotLabels(slots[slots.length - 1].fecha, slots[slots.length - 1].hora)
  return { timeMinISO: first.startISO, timeMaxISO: last.endISO }
}

export type BusyInterval = { start: string; end: string }

export function intervalsOverlap(
  aStartISO: string,
  aEndISO: string,
  bStartISO: string,
  bEndISO: string,
): boolean {
  const aStart = new Date(aStartISO).getTime()
  const aEnd = new Date(aEndISO).getTime()
  const bStart = new Date(bStartISO).getTime()
  const bEnd = new Date(bEndISO).getTime()
  return aStart < bEnd && aEnd > bStart
}

export function isJointSlotFree(
  busyByEmail: Record<string, BusyInterval[]>,
  emails: string[],
  fecha: string,
  hora: string,
): boolean {
  const { startISO, endISO } = parseSlotLabels(fecha, hora)
  for (const email of emails) {
    const blocks = busyByEmail[email.toLowerCase()] ?? busyByEmail[email] ?? []
    for (const block of blocks) {
      if (intervalsOverlap(startISO, endISO, block.start, block.end)) {
        return false
      }
    }
  }
  return true
}

export function isValidSlotLabel(fecha: unknown, hora: unknown): boolean {
  return typeof fecha === 'string' && typeof hora === 'string' && FECHA_RE.test(fecha.trim()) && HORA_RE.test(hora.trim())
}
