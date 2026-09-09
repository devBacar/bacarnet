import { assertEmailList, assertNonEmptyString } from './validateCorporateEmails.js'
import {
  findCalendarConflicts,
  formatCalendarConflictWarning,
  formatPlanInternalConflictWarning,
  type CalendarConflict,
} from './calendarConflicts.js'
import { createPendingCalendarAction, pendingActionToToolResponse } from './pendingActionStore.js'
import type { CalendarActionPayload } from './types.js'
import {
  DEFAULT_CALENDAR_TIMEZONE,
  floatingRangeToMs,
  parseAssistantCalendarDateTime,
} from './calendarDateTime.js'

const MAX_TITLE_LEN = 200
const MAX_DESCRIPTION_LEN = 4000
const MAX_LOCATION_LEN = 300

function parseAttendees(args: Record<string, unknown>): string[] {
  const fromArray = assertEmailList(args.attendees, 'Invitados', { max: 20 })
  if (fromArray.length > 0) return fromArray

  const single =
    typeof args.attendeeEmail === 'string'
      ? assertEmailList(args.attendeeEmail, 'Invitado', { max: 1 })
      : []
  if (single.length > 0) return single

  if (typeof args.attendees === 'string' && args.attendees.trim()) {
    return assertEmailList(args.attendees, 'Invitados', { max: 20 })
  }

  return []
}

function parseDateTime(raw: unknown, fieldLabel: string, timeZone: string): string {
  const value = assertNonEmptyString(raw, fieldLabel, 40)
  return parseAssistantCalendarDateTime(value, timeZone)
}

function parsePlanConflicts(args: Record<string, unknown>): CalendarConflict[] {
  if (!Array.isArray(args.planConflicts)) return []
  const conflicts: CalendarConflict[] = []
  for (const item of args.planConflicts) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const title = typeof record.title === 'string' ? record.title.trim() : ''
    const start = typeof record.start === 'string' ? record.start.trim() : ''
    const end = typeof record.end === 'string' ? record.end.trim() : ''
    if (title && start && end) {
      conflicts.push({ title, start, end })
    }
  }
  return conflicts
}

export async function prepareCalendarDraftTool(input: {
  userId: string
  userEmail: string
  impersonateAs: string
  args: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  try {
    const title = assertNonEmptyString(input.args.title, 'Título', MAX_TITLE_LEN)
    const timeZone = DEFAULT_CALENDAR_TIMEZONE
    const startDateTime = parseDateTime(input.args.startDateTime, 'Inicio', timeZone)
    const endDateTime = parseDateTime(input.args.endDateTime, 'Fin', timeZone)

    const { startMs, endMs } = floatingRangeToMs(startDateTime, endDateTime, timeZone)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      throw new Error('La hora de fin debe ser posterior a la de inicio.')
    }

    const description =
      typeof input.args.description === 'string' ? input.args.description.trim().slice(0, MAX_DESCRIPTION_LEN) : ''
    const location =
      typeof input.args.location === 'string' && input.args.location.trim()
        ? input.args.location.trim().slice(0, MAX_LOCATION_LEN)
        : null
    const attendees = parseAttendees(input.args)
    const addGoogleMeet =
      input.args.addGoogleMeet === true ||
      (typeof input.args.addGoogleMeet === 'string' &&
        ['true', '1', 'yes', 'si', 'sí'].includes(input.args.addGoogleMeet.trim().toLowerCase()))

    const calendarConflicts = await findCalendarConflicts({
      impersonateAs: input.impersonateAs,
      startDateTime,
      endDateTime,
      timeZone,
    })
    const planConflicts = parsePlanConflicts(input.args)
    const allConflicts = [...planConflicts, ...calendarConflicts]

    const payload: CalendarActionPayload = {
      title,
      description,
      location,
      startDateTime,
      endDateTime,
      timeZone,
      attendees,
      ...(addGoogleMeet ? { addGoogleMeet: true } : {}),
    }

    const pending = await createPendingCalendarAction({
      userId: input.userId,
      userEmail: input.userEmail,
      impersonateAs: input.impersonateAs,
      payload,
      calendarConflicts: allConflicts,
    })

    const base = pendingActionToToolResponse(pending)
    if (allConflicts.length > 0) {
      const planWarning = formatPlanInternalConflictWarning(planConflicts)
      const calendarWarning = formatCalendarConflictWarning(calendarConflicts)
      const conflictWarning = [planWarning, calendarWarning].filter(Boolean).join('\n\n')
      return {
        ...base,
        calendarConflicts: allConflicts,
        conflictWarning,
        message: `${String(base.message ?? '')}\n${conflictWarning}`.trim(),
      }
    }

    return base
  } catch (err) {
    return {
      error: 'CALENDAR_DRAFT_INVALID',
      message: err instanceof Error ? err.message : 'No se pudo preparar el borrador del evento.',
    }
  }
}
