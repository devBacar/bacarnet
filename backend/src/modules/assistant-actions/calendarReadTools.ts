import { getCalendar } from '../../lib/google/workspaceGoogleClients.js'
import {
  DEFAULT_CALENDAR_TIMEZONE,
  addDaysIso,
  calendarDayBoundaryIso,
  todayInTimeZone,
  toFloatingDateTimeInZone,
} from './calendarDateTime.js'

const MAX_RESULTS = 25

function parseDateOnly(raw: unknown, fieldLabel: string): string {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    throw new Error(`${fieldLabel} debe tener formato YYYY-MM-DD.`)
  }
  return raw.trim()
}

function eventStartIso(event: {
  start?: { dateTime?: string | null; date?: string | null; timeZone?: string | null } | null
}): string {
  if (event.start?.dateTime) {
    const timeZone = event.start.timeZone?.trim() || DEFAULT_CALENDAR_TIMEZONE
    return toFloatingDateTimeInZone(event.start.dateTime, timeZone)
  }
  if (event.start?.date) return `${event.start.date}T00:00:00`
  return ''
}

function eventEndIso(event: {
  end?: { dateTime?: string | null; date?: string | null; timeZone?: string | null } | null
}): string | null {
  if (event.end?.dateTime) {
    const timeZone = event.end.timeZone?.trim() || DEFAULT_CALENDAR_TIMEZONE
    return toFloatingDateTimeInZone(event.end.dateTime, timeZone)
  }
  if (event.end?.date) return `${event.end.date}T00:00:00`
  return null
}

function formatEventForAssistant(event: {
  id?: string | null
  summary?: string | null
  start?: { dateTime?: string | null; date?: string | null; timeZone?: string | null } | null
  end?: { dateTime?: string | null; date?: string | null; timeZone?: string | null } | null
  location?: string | null
  attendees?: Array<{ email?: string | null; responseStatus?: string | null }> | null
  status?: string | null
}) {
  const attendees = (event.attendees ?? [])
    .map((guest) => guest.email?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email))

  return {
    eventId: event.id?.trim() || null,
    title: event.summary?.trim() || '(Sin título)',
    start: eventStartIso(event),
    end: eventEndIso(event),
    location: event.location?.trim() || null,
    attendees,
    status: event.status ?? null,
    allDay: Boolean(event.start?.date && !event.start?.dateTime),
  }
}

function dedupeCalendarEvents<
  T extends { eventId: string | null; title: string; start: string; end: string | null },
>(events: T[]): T[] {
  const seenIds = new Set<string>()
  const seenKeys = new Set<string>()
  const unique: T[] = []

  for (const event of events) {
    if (event.eventId) {
      if (seenIds.has(event.eventId)) continue
      seenIds.add(event.eventId)
    }
    const key = `${event.title}|${event.start}|${event.end ?? ''}`
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    unique.push(event)
  }

  return unique
}

export async function listCalendarEventsTool(input: {
  impersonateAs: string
  args: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  try {
    const timeZone = DEFAULT_CALENDAR_TIMEZONE
    const today = todayInTimeZone(timeZone)

    let dateFrom =
      typeof input.args.dateFrom === 'string' ? parseDateOnly(input.args.dateFrom, 'dateFrom') : today
    let dateTo =
      typeof input.args.dateTo === 'string'
        ? parseDateOnly(input.args.dateTo, 'dateTo')
        : dateFrom

    if (dateTo < dateFrom) {
      throw new Error('dateTo no puede ser anterior a dateFrom.')
    }

    const maxDays = 14
    if (new Date(dateTo).getTime() - new Date(dateFrom).getTime() > maxDays * 86_400_000) {
      throw new Error(`El rango máximo es de ${maxDays} días.`)
    }

    const timeMin = calendarDayBoundaryIso(dateFrom, 'start')
    const timeMax = calendarDayBoundaryIso(dateTo, 'end')

    const calendar = await getCalendar(input.impersonateAs)
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: MAX_RESULTS,
    })

    const events = dedupeCalendarEvents(
      (res.data.items ?? []).map(formatEventForAssistant),
    )

    return {
      calendarOwner: input.impersonateAs,
      dateFrom,
      dateTo,
      timeZone,
      eventCount: events.length,
      events,
      note:
        events.length >= MAX_RESULTS
          ? `Mostrando hasta ${MAX_RESULTS} eventos. Pedí un rango más chico si necesitás detalle adicional.`
          : 'Agenda del calendario primario del usuario autenticado.',
    }
  } catch (err) {
    return {
      error: 'CALENDAR_LIST_FAILED',
      message: err instanceof Error ? err.message : 'No se pudo consultar el calendario.',
    }
  }
}

function parseMinutes(raw: unknown, fallback = 30): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback
  return Math.min(240, Math.max(15, Math.floor(raw)))
}

function parseHourMinute(raw: string): number {
  const [h, m] = raw.split(':').map((part) => Number.parseInt(part, 10))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

function minutesToLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export async function findCalendarFreeSlotsTool(input: {
  impersonateAs: string
  args: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  try {
    const timeZone = DEFAULT_CALENDAR_TIMEZONE
    const today = todayInTimeZone(timeZone)
    const dateFrom =
      typeof input.args.dateFrom === 'string' ? parseDateOnly(input.args.dateFrom, 'dateFrom') : today
    const dateTo =
      typeof input.args.dateTo === 'string' ? parseDateOnly(input.args.dateTo, 'dateTo') : dateFrom
    const durationMinutes = parseMinutes(input.args.durationMinutes, 30)
    const workStart = typeof input.args.workDayStart === 'string' ? input.args.workDayStart : '09:00'
    const workEnd = typeof input.args.workDayEnd === 'string' ? input.args.workDayEnd : '18:00'

    const workStartMinutes = parseHourMinute(workStart)
    const workEndMinutes = parseHourMinute(workEnd)
    if (workEndMinutes <= workStartMinutes) {
      throw new Error('workDayEnd debe ser posterior a workDayStart.')
    }

    const calendar = await getCalendar(input.impersonateAs)
    const timeMin = new Date(`${dateFrom}T00:00:00`).toISOString()
    const timeMax = new Date(`${dateTo}T23:59:59`).toISOString()

    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        timeZone,
        items: [{ id: 'primary' }],
      },
    })

    const busyRaw = freeBusy.data.calendars?.primary?.busy ?? []
    const slots: Array<{ date: string; start: string; end: string }> = []

    let cursorDate = dateFrom
    while (cursorDate <= dateTo) {
      const dayStart = new Date(`${cursorDate}T00:00:00`)
      const dayBusy = busyRaw
        .map((block) => ({
          start: block.start ? new Date(block.start).getTime() : 0,
          end: block.end ? new Date(block.end).getTime() : 0,
        }))
        .filter((block) => block.end > block.start)
        .filter((block) => {
          const dayEnd = new Date(`${cursorDate}T23:59:59`).getTime()
          return block.start <= dayEnd && block.end >= dayStart.getTime()
        })
        .sort((a, b) => a.start - b.start)

      let pointer = workStartMinutes
      for (const block of dayBusy) {
        const blockStart = toFloatingDateTimeInZone(new Date(block.start).toISOString(), timeZone)
        const blockEnd = toFloatingDateTimeInZone(new Date(block.end).toISOString(), timeZone)
        const blockStartMinutes = parseHourMinute(blockStart.slice(11, 16))
        const blockEndMinutes = parseHourMinute(blockEnd.slice(11, 16))

        while (pointer + durationMinutes <= Math.min(blockStartMinutes, workEndMinutes)) {
          slots.push({
            date: cursorDate,
            start: minutesToLabel(pointer),
            end: minutesToLabel(pointer + durationMinutes),
          })
          pointer += durationMinutes
        }
        pointer = Math.max(pointer, blockEndMinutes)
      }

      while (pointer + durationMinutes <= workEndMinutes) {
        slots.push({
          date: cursorDate,
          start: minutesToLabel(pointer),
          end: minutesToLabel(pointer + durationMinutes),
        })
        pointer += durationMinutes
      }

      cursorDate = addDaysIso(cursorDate, 1)
    }

    return {
      calendarOwner: input.impersonateAs,
      dateFrom,
      dateTo,
      durationMinutes,
      workDayStart: workStart,
      workDayEnd: workEnd,
      freeSlotCount: slots.length,
      freeSlots: slots.slice(0, 20),
      note: 'Huecos libres calculados sobre el calendario primario del usuario autenticado.',
    }
  } catch (err) {
    return {
      error: 'CALENDAR_FREEBUSY_FAILED',
      message: err instanceof Error ? err.message : 'No se pudo calcular disponibilidad.',
    }
  }
}
