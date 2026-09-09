export const MAX_PLAN_ACTIONS = 10
export const MAX_SYNC_PREPARE_ACTIONS = 5
export const PREPARE_DEADLINE_MS = 50_000

export type BodySource =
  | { type: 'summaries' }
  | { type: 'previous_assistant' }
  | { type: 'literal'; text: string }

export type PlannedEmailAction = {
  kind: 'email'
  ref: string
  to: string[]
  cc?: string[]
  subject: string
  bodySource: BodySource
}

export type PlannedCalendarAction = {
  kind: 'calendar_event'
  ref: string
  title: string
  startDateTime: string
  endDateTime: string
  attendees: string[]
  location?: string | null
  addGoogleMeet: boolean
  description?: string
}

export type PlannedCalendarCancelAction = {
  kind: 'calendar_cancel'
  ref: string
  eventId: string
  title: string
  startDateTime: string
  endDateTime: string
  attendees: string[]
}

export type PlannedAction = PlannedEmailAction | PlannedCalendarAction | PlannedCalendarCancelAction

export type CalendarEventCatalogEntry = {
  eventId: string
  title: string
  start: string
  end: string | null
  attendees: string[]
  allDay?: boolean
}

export type ActionPlan = {
  actions: PlannedAction[]
  assumptions?: string[]
}

export type ActionContext = {
  summariesText?: string
  previousAssistantText?: string
  referenceDate: string
  calendarEventsCatalog?: CalendarEventCatalogEntry[]
}

export type PreparationSuccess = {
  ref: string
  ok: true
  pendingActionId: string
  type: 'email' | 'calendar_event' | 'calendar_cancel'
  label: string
}

export type PreparationFailure = {
  ref: string
  ok: false
  errorCode: string
  message: string
}

export type PreparationResult = PreparationSuccess | PreparationFailure

export type PrepareBatchResult = {
  results: PreparationResult[]
  deferredRefs: string[]
}
