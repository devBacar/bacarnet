import { getCalendar, getCalendarReadonly } from '../../lib/google/workspaceGoogleClients.js'
import { HELPDESK_SLOT_TIMEZONE } from './slotScheduling.js'
import { toCalendarDateTime } from '../assistant-actions/calendarDateTime.js'

export type BusyBlocksByEmail = Record<string, Array<{ start: string; end: string }>>

export async function getFreeBusyForEmails(
  emails: string[],
  timeMinISO: string,
  timeMaxISO: string,
): Promise<BusyBlocksByEmail> {
  const normalized = emails.map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (normalized.length === 0) {
    return {}
  }

  const calendar = await getCalendarReadonly(normalized[0])
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      timeZone: HELPDESK_SLOT_TIMEZONE,
      items: normalized.map((id) => ({ id })),
    },
  })

  const calendars = res.data.calendars ?? {}
  const out: BusyBlocksByEmail = {}
  for (const email of normalized) {
    const entry = calendars[email]
    out[email] = (entry?.busy ?? [])
      .filter((b): b is { start?: string; end?: string } => Boolean(b?.start && b?.end))
      .map((b) => ({ start: b.start!, end: b.end! }))
  }
  return out
}

export async function createCalendarEvent(input: {
  organizerEmail: string
  attendeeEmails: string[]
  summary: string
  description: string
  startISO: string
  endISO: string
}): Promise<{ eventId: string; htmlLink: string | null | undefined }> {
  const organizer = input.organizerEmail.trim().toLowerCase()
  const attendeeSet = new Set<string>()
  attendeeSet.add(organizer)
  for (const email of input.attendeeEmails) {
    const normalized = email.trim().toLowerCase()
    if (normalized) attendeeSet.add(normalized)
  }

  const calendar = await getCalendar(organizer)
  const startFloating = toFloatingFromIso(input.startISO, HELPDESK_SLOT_TIMEZONE)
  const endFloating = toFloatingFromIso(input.endISO, HELPDESK_SLOT_TIMEZONE)

  const res = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'all',
    requestBody: {
      summary: input.summary,
      description: input.description || undefined,
      start: toCalendarDateTime(startFloating, HELPDESK_SLOT_TIMEZONE),
      end: toCalendarDateTime(endFloating, HELPDESK_SLOT_TIMEZONE),
      attendees: [...attendeeSet].map((email) => ({ email })),
      guestsCanModify: false,
    },
  })

  return {
    eventId: res.data.id ?? '',
    htmlLink: res.data.htmlLink,
  }
}

function toFloatingFromIso(iso: string, timeZone: string): string {
  const date = new Date(iso)
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
    parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}

export type CalendarAttendeeStatus = {
  email: string
  responseStatus: 'needsAction' | 'accepted' | 'declined' | 'tentative' | string
}

export async function deleteCalendarEvent(
  organizerEmail: string,
  eventId: string,
): Promise<void> {
  const calendar = await getCalendar(organizerEmail.trim().toLowerCase())
  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
    sendUpdates: 'all',
  })
}

export async function getEventAttendeeStatus(
  organizerEmail: string,
  eventId: string,
): Promise<CalendarAttendeeStatus[]> {
  const calendar = await getCalendar(organizerEmail.trim().toLowerCase())
  const res = await calendar.events.get({
    calendarId: 'primary',
    eventId,
  })
  const attendees = res.data.attendees ?? []
  return attendees
    .filter((a): a is { email?: string; responseStatus?: string } => Boolean(a?.email))
    .map((a) => ({
      email: a.email!.trim().toLowerCase(),
      responseStatus: (a.responseStatus ?? 'needsAction') as CalendarAttendeeStatus['responseStatus'],
    }))
}
