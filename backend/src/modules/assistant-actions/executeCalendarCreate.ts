import { getCalendar } from '../../lib/google/workspaceGoogleClients.js'
import type { CalendarActionPayload } from './types.js'
import { toCalendarDateTime } from './calendarDateTime.js'

export async function executeCalendarCreate(input: {
  impersonateAs: string
  payload: CalendarActionPayload
}): Promise<{
  eventId: string
  htmlLink: string | null | undefined
  status: string | null | undefined
  hangoutLink: string | null
}> {
  const calendar = await getCalendar(input.impersonateAs)
  const attendees = input.payload.attendees.map((email) => ({ email: email.trim().toLowerCase() }))

  const addGoogleMeet = input.payload.addGoogleMeet === true

  const res = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'all',
    conferenceDataVersion: addGoogleMeet ? 1 : undefined,
    requestBody: {
      summary: input.payload.title,
      description: input.payload.description || undefined,
      location: input.payload.location ?? undefined,
      start: toCalendarDateTime(input.payload.startDateTime, input.payload.timeZone),
      end: toCalendarDateTime(input.payload.endDateTime, input.payload.timeZone),
      attendees: attendees.length > 0 ? attendees : undefined,
      guestsCanModify: false,
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 10 }],
      },
      ...(addGoogleMeet
        ? {
            conferenceData: {
              createRequest: {
                requestId: `bacarnet-${Date.now()}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            },
          }
        : {}),
    },
  })

  return {
    eventId: res.data.id ?? '',
    htmlLink: res.data.htmlLink,
    status: res.data.status,
    hangoutLink: res.data.hangoutLink ?? null,
  }
}
