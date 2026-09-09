import { getCalendar } from '../../lib/google/workspaceGoogleClients.js'
import { assertEmailList, assertNonEmptyString } from './validateCorporateEmails.js'
import {
  DEFAULT_CALENDAR_TIMEZONE,
  parseAssistantCalendarDateTime,
} from './calendarDateTime.js'
import { createPendingCalendarCancelAction, pendingActionToToolResponse } from './pendingActionStore.js'
import type { CalendarCancelActionPayload } from './types.js'

function parseDateTime(raw: unknown, fieldLabel: string, timeZone: string): string {
  const value = assertNonEmptyString(raw, fieldLabel, 40)
  return parseAssistantCalendarDateTime(value, timeZone)
}

export async function prepareCalendarCancelDraftTool(input: {
  userId: string
  userEmail: string
  impersonateAs: string
  args: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  try {
    const eventId = assertNonEmptyString(input.args.eventId, 'ID del evento', 200)
    const title = assertNonEmptyString(input.args.title, 'Título', 200)
    const timeZone = DEFAULT_CALENDAR_TIMEZONE
    const startDateTime = parseDateTime(input.args.startDateTime, 'Inicio', timeZone)
    const endDateTime = parseDateTime(input.args.endDateTime, 'Fin', timeZone)

    const calendar = await getCalendar(input.impersonateAs)
    const existing = await calendar.events.get({
      calendarId: 'primary',
      eventId,
    })

    if (!existing.data.id) {
      throw new Error('El evento ya no existe en tu calendario.')
    }
    if (existing.data.status === 'cancelled') {
      throw new Error('Ese evento ya fue cancelado.')
    }

    const payload: CalendarCancelActionPayload = {
      eventId,
      title,
      startDateTime,
      endDateTime,
      timeZone,
      attendees: assertEmailList(input.args.attendees, 'Invitados', { max: 20 }),
    }

    const pending = await createPendingCalendarCancelAction({
      userId: input.userId,
      userEmail: input.userEmail,
      impersonateAs: input.impersonateAs,
      payload,
    })

    return {
      ...pendingActionToToolResponse(pending),
      message:
        'Cancelación preparada. El usuario debe revisar el evento y confirmar explícitamente en la interfaz del chat antes de eliminarlo del calendario.',
    }
  } catch (err) {
    return {
      error: 'CALENDAR_CANCEL_DRAFT_INVALID',
      message: err instanceof Error ? err.message : 'No se pudo preparar la cancelación del evento.',
    }
  }
}
