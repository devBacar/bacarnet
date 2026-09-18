/** Alineado con backend helpdesk/schedulingConstants (America/Argentina/Buenos_Aires). */

import { HELPDESK_BUSINESS_DAYS_COUNT } from '@intranet/helpdesk-scheduling'

export { HELPDESK_BUSINESS_DAYS_COUNT }

export const HELPDESK_SLOT_TIMEZONE = 'America/Argentina/Buenos_Aires'

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
  return localWallTimeToUtc(`${y}-${m}-${d}T00:00:00`, timeZone)
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

function localWallTimeToUtc(floatingLocal: string, timeZone: string): Date {
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

export function collectHelpdeskBusinessDayLabels(semanaOffset: number, now = new Date()): string[] {
  const timeZone = HELPDESK_SLOT_TIMEZONE
  const offsetWeeks = Number.isFinite(semanaOffset) ? Math.max(0, semanaOffset) : 0

  let cursor = startOfLocalDayInZone(now, timeZone)
  cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  cursor = new Date(cursor.getTime() + offsetWeeks * 7 * 24 * 60 * 60 * 1000)

  const labels: string[] = []
  while (labels.length < HELPDESK_BUSINESS_DAYS_COUNT) {
    if (!isWeekendInZone(cursor, timeZone)) {
      labels.push(formatFechaLabel(cursor, timeZone))
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  }
  return labels
}

export function formatHelpdeskDayHeader(fecha: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fecha.trim())
  if (!match) return fecha
  const [, dd, mm, yyyy] = match
  const noonUtc = localWallTimeToUtc(`${yyyy}-${mm}-${dd}T12:00:00`, HELPDESK_SLOT_TIMEZONE)
  const weekday = new Intl.DateTimeFormat('es-AR', {
    timeZone: HELPDESK_SLOT_TIMEZONE,
    weekday: 'short',
  }).format(noonUtc)
  const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1).replace('.', '')
  return `${cap} ${dd}/${mm}`
}
