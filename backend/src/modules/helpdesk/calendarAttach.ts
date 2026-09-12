import { createCalendarEvent } from './calendar.js'
import { updateHelpdeskReunion } from './repository.js'

export async function attachCalendarEventToReunion(input: {
  ticketId: string
  reunionId: string
  organizerEmail: string
  attendeeEmails: string[]
  summary: string
  description: string
  startISO: string
  endISO: string
}): Promise<void> {
  try {
    const created = await createCalendarEvent({
      organizerEmail: input.organizerEmail,
      attendeeEmails: input.attendeeEmails,
      summary: input.summary,
      description: input.description,
      startISO: input.startISO,
      endISO: input.endISO,
    })
    await updateHelpdeskReunion(input.ticketId, input.reunionId, {
      calendarEventId: created.eventId,
      calendarHtmlLink: created.htmlLink ?? null,
      calendarOrganizerEmail: input.organizerEmail.trim().toLowerCase(),
      calendarError: false,
      calendarErrorMessage: null,
    })
  } catch (err) {
    console.error('helpdesk: fallo al crear evento de Calendar', err)
    await updateHelpdeskReunion(input.ticketId, input.reunionId, {
      calendarError: true,
      calendarErrorMessage: err instanceof Error ? err.message : String(err),
    })
  }
}
