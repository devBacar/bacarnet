import { getCalendar } from '../../lib/google/workspaceGoogleClients.js'
import {
  DEFAULT_CALENDAR_TIMEZONE,
  floatingRangeToMs,
} from './calendarDateTime.js'

export type CalendarConflict = {
  title: string
  start: string
  end: string
}

function proposedRangeToMs(startDateTime: string, endDateTime: string): { startMs: number; endMs: number } {
  return floatingRangeToMs(startDateTime, endDateTime, DEFAULT_CALENDAR_TIMEZONE)
}

function eventRangeToMs(event: {
  start?: { dateTime?: string | null; date?: string | null } | null
  end?: { dateTime?: string | null; date?: string | null } | null
}): { startMs: number; endMs: number } | null {
  if (event.start?.dateTime) {
    const startMs = new Date(event.start.dateTime).getTime()
    const endMs = event.end?.dateTime
      ? new Date(event.end.dateTime).getTime()
      : startMs + 30 * 60_000
    return { startMs, endMs }
  }

  if (event.start?.date) {
    const startMs = new Date(`${event.start.date}T00:00:00`).getTime()
    const endDate = event.end?.date ?? event.start.date
    const endMs = new Date(`${endDate}T23:59:59`).getTime()
    return { startMs, endMs }
  }

  return null
}

function formatConflictRange(startMs: number, endMs: number, timeZone: string): { start: string; end: string } {
  const fmt = (ms: number) =>
    new Date(ms).toLocaleString('es-AR', {
      timeZone,
      dateStyle: 'short',
      timeStyle: 'short',
    })
  return { start: fmt(startMs), end: fmt(endMs) }
}

function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd
}

export async function findCalendarConflicts(input: {
  impersonateAs: string
  startDateTime: string
  endDateTime: string
  timeZone?: string
}): Promise<CalendarConflict[]> {
  const timeZone = input.timeZone ?? DEFAULT_CALENDAR_TIMEZONE
  const { startMs, endMs } = proposedRangeToMs(input.startDateTime, input.endDateTime)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return []
  }

  const dayStart = input.startDateTime.slice(0, 10)
  const dayEnd = input.endDateTime.slice(0, 10)
  const timeMin = new Date(`${dayStart}T00:00:00-03:00`).toISOString()
  const timeMax = new Date(`${dayEnd}T23:59:59-03:00`).toISOString()

  const calendar = await getCalendar(input.impersonateAs)
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 50,
  })

  const conflicts: CalendarConflict[] = []
  for (const event of res.data.items ?? []) {
    if (event.status === 'cancelled') continue
    const range = eventRangeToMs(event)
    if (!range) continue
    if (!rangesOverlap(startMs, endMs, range.startMs, range.endMs)) continue

    const formatted = formatConflictRange(range.startMs, range.endMs, timeZone)
    conflicts.push({
      title: event.summary?.trim() || '(Sin título)',
      start: formatted.start,
      end: formatted.end,
    })
  }

  return conflicts
}

export function formatCalendarConflictWarning(conflicts: CalendarConflict[]): string {
  if (conflicts.length === 0) return ''
  const lines = conflicts.map(
    (conflict) => `- "${conflict.title}" (${conflict.start} – ${conflict.end})`,
  )
  return (
    'Ojo: ese horario se superpone con evento(s) que ya tenés en el calendario:\n' +
    `${lines.join('\n')}\n` +
    'Podés confirmar igual o pedirme otro horario.'
  )
}

export type PlanCalendarEvent = {
  ref: string
  title: string
  startDateTime: string
  endDateTime: string
}

function formatFloatingConflictRange(
  startDateTime: string,
  endDateTime: string,
  timeZone: string,
): { start: string; end: string } {
  const { startMs, endMs } = proposedRangeToMs(startDateTime, endDateTime)
  return formatConflictRange(startMs, endMs, timeZone)
}

export function findPlanInternalCalendarConflicts(
  events: PlanCalendarEvent[],
  timeZone: string = DEFAULT_CALENDAR_TIMEZONE,
): Map<string, CalendarConflict[]> {
  const byRef = new Map<string, CalendarConflict[]>()

  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const a = events[i]
      const b = events[j]
      const aRange = proposedRangeToMs(a.startDateTime, a.endDateTime)
      const bRange = proposedRangeToMs(b.startDateTime, b.endDateTime)
      if (!rangesOverlap(aRange.startMs, aRange.endMs, bRange.startMs, bRange.endMs)) {
        continue
      }

      const aFormatted = formatFloatingConflictRange(a.startDateTime, a.endDateTime, timeZone)
      const bFormatted = formatFloatingConflictRange(b.startDateTime, b.endDateTime, timeZone)

      const aConflicts = byRef.get(a.ref) ?? []
      aConflicts.push({
        title: `${b.title} (otro evento de este pedido)`,
        start: bFormatted.start,
        end: bFormatted.end,
      })
      byRef.set(a.ref, aConflicts)

      const bConflicts = byRef.get(b.ref) ?? []
      bConflicts.push({
        title: `${a.title} (otro evento de este pedido)`,
        start: aFormatted.start,
        end: aFormatted.end,
      })
      byRef.set(b.ref, bConflicts)
    }
  }

  return byRef
}

export function formatPlanInternalConflictWarning(conflicts: CalendarConflict[]): string {
  if (conflicts.length === 0) return ''
  const lines = conflicts
    .filter((conflict) => conflict.title.includes('(otro evento de este pedido)'))
    .map((conflict) => `- "${conflict.title}" (${conflict.start} – ${conflict.end})`)
  if (lines.length === 0) return ''
  return (
    'Ojo: ese horario se superpone con otro evento del mismo pedido:\n' +
    `${lines.join('\n')}\n` +
    'Podés confirmar igual o pedirme otro horario.'
  )
}
