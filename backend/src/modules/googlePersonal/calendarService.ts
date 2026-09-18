import { google } from 'googleapis'
import { GoogleReconnectRequiredError, isInvalidGrantError } from './errors.js'
import { deleteGooglePersonalIntegration } from './store.js'

export interface WidgetCalendarEvent {
  id: string
  summary: string
  startTime: string
}

export interface WidgetCalendarAttendee {
  email: string
  displayName: string | null
  responseStatus: string
}

export interface WidgetCalendarEventDetail {
  id: string
  summary: string
  start: string | null
  end: string | null
  allDay: boolean
  location: string | null
  description: string | null
  attendees: WidgetCalendarAttendee[]
  calendarWebUrl: string | null
}

function getTodayBounds() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  }
}

function formatEventStartTime(start?: {
  dateTime?: string | null
  date?: string | null
}): string {
  if (start?.dateTime) {
    return new Date(start.dateTime).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Argentina/Buenos_Aires',
    })
  }
  if (start?.date) return 'Todo el día'
  return '--:--'
}

export async function fetchWidgetCalendarEvents(
  uid: string,
  auth: unknown,
): Promise<WidgetCalendarEvent[]> {
  const calendar = google.calendar({ version: 'v3', auth: auth as never })
  const { timeMin, timeMax } = getTodayBounds()

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 4,
    })

    return (response.data.items ?? []).slice(0, 4).flatMap((item) => {
      if (!item.id) return []
      return [
        {
          id: item.id,
          summary: item.summary?.trim() || 'Sin título',
          startTime: formatEventStartTime(item.start ?? undefined),
        },
      ]
    })
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await deleteGooglePersonalIntegration(uid)
      throw new GoogleReconnectRequiredError()
    }
    throw err
  }
}

function formatEventDateTime(start?: {
  dateTime?: string | null
  date?: string | null
}): { iso: string | null; allDay: boolean } {
  if (start?.dateTime) {
    return { iso: start.dateTime, allDay: false }
  }
  if (start?.date) {
    return { iso: `${start.date}T00:00:00`, allDay: true }
  }
  return { iso: null, allDay: false }
}

function attendeeStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'accepted':
      return 'Aceptado'
    case 'declined':
      return 'Rechazado'
    case 'tentative':
      return 'Tal vez'
    case 'needsAction':
      return 'Pendiente'
    default:
      return status?.trim() || 'Desconocido'
  }
}

export async function fetchWidgetCalendarEventDetail(
  uid: string,
  auth: unknown,
  eventId: string,
): Promise<WidgetCalendarEventDetail | null> {
  const calendar = google.calendar({ version: 'v3', auth: auth as never })

  try {
    const response = await calendar.events.get({
      calendarId: 'primary',
      eventId,
    })
    const item = response.data
    if (!item.id) return null

    const start = formatEventDateTime(item.start ?? undefined)
    const end = formatEventDateTime(item.end ?? undefined)

    return {
      id: item.id,
      summary: item.summary?.trim() || 'Sin título',
      start: start.iso,
      end: end.iso,
      allDay: start.allDay,
      location: item.location?.trim() || null,
      description: item.description?.trim() || null,
      attendees: (item.attendees ?? []).map((attendee) => ({
        email: attendee.email?.trim() || 'Sin email',
        displayName: attendee.displayName?.trim() || null,
        responseStatus: attendeeStatusLabel(attendee.responseStatus),
      })),
      calendarWebUrl: item.htmlLink?.trim() || null,
    }
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await deleteGooglePersonalIntegration(uid)
      throw new GoogleReconnectRequiredError()
    }
    throw err
  }
}
