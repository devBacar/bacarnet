import { getCalendar } from '../../lib/google/workspaceGoogleClients.js'
import type { CalendarCancelActionPayload } from './types.js'

export async function executeCalendarCancel(input: {
  impersonateAs: string
  payload: CalendarCancelActionPayload
}): Promise<{ eventId: string }> {
  const calendar = await getCalendar(input.impersonateAs)
  await calendar.events.delete({
    calendarId: 'primary',
    eventId: input.payload.eventId,
    sendUpdates: 'all',
  })
  return { eventId: input.payload.eventId }
}
