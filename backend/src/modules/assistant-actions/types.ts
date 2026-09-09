import type { Timestamp } from 'firebase-admin/firestore'

export const ASSISTANT_PENDING_ACTIONS_COLLECTION = 'assistantPendingActions'

export const PENDING_ACTION_TTL_MS = 15 * 60 * 1000

export type AssistantActionType = 'email' | 'calendar_event' | 'calendar_cancel'
export type AssistantActionStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired'

export type EmailActionPayload = {
  to: string[]
  cc: string[]
  subject: string
  body: string
}

export type CalendarActionPayload = {
  title: string
  description: string
  location: string | null
  startDateTime: string
  endDateTime: string
  timeZone: string
  attendees: string[]
  addGoogleMeet?: boolean
}

export type EmailActionPreview = EmailActionPayload & {
  from: string
}

export type CalendarActionPreview = CalendarActionPayload & {
  organizer: string
  calendarConflicts?: CalendarConflictPreview[]
  /** Invitados fuera del dominio corporativo (solo para UI de confirmación). */
  externalAttendees?: string[]
}

export type CalendarCancelActionPayload = {
  eventId: string
  title: string
  startDateTime: string
  endDateTime: string
  timeZone: string
  attendees: string[]
}

export type CalendarCancelActionPreview = CalendarCancelActionPayload & {
  organizer: string
}

export type CalendarConflictPreview = {
  title: string
  start: string
  end: string
}

export type AssistantPendingActionRecord = {
  type: AssistantActionType
  status: AssistantActionStatus
  userId: string
  userEmail: string
  impersonateAs: string
  payload: EmailActionPayload | CalendarActionPayload | CalendarCancelActionPayload
  preview: EmailActionPreview | CalendarActionPreview | CalendarCancelActionPreview
  expiresAt: Timestamp
  createdAt: Timestamp
  confirmedAt?: Timestamp
  cancelledAt?: Timestamp
  result?: Record<string, unknown>
}

export type AssistantPendingActionDto = {
  id: string
  type: AssistantActionType
  status: AssistantActionStatus
  preview: EmailActionPreview | CalendarActionPreview | CalendarCancelActionPreview
  expiresAt: string
}

export type AssistantActionConfirmResult = {
  ok: true
  actionId: string
  type: AssistantActionType
  message: string
  result: Record<string, unknown>
}
