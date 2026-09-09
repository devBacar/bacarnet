import {
  assertCorporateEmailList,
  assertEmailList,
  assertNonEmptyString,
} from '../assistant-actions/validateCorporateEmails.js'
import {
  DEFAULT_CALENDAR_TIMEZONE,
  floatingRangeToMs,
  parseAssistantCalendarDateTime,
} from '../assistant-actions/calendarDateTime.js'
import {
  MAX_PLAN_ACTIONS,
  type ActionPlan,
  type BodySource,
  type PlannedAction,
  type CalendarEventCatalogEntry,
  type PlannedCalendarAction,
  type PlannedCalendarCancelAction,
  type PlannedEmailAction,
} from './actionPlanTypes.js'

export class ActionPlanValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActionPlanValidationError'
  }
}

export type ActionPlanValidationFailure = {
  ref: string
  errorCode: string
  message: string
}

export type ValidatedActionPlanResult = {
  plan: ActionPlan
  validationFailures: ActionPlanValidationFailure[]
}

function parseBodySource(raw: unknown): BodySource {
  if (!raw || typeof raw !== 'object') {
    return { type: 'summaries' }
  }
  const type = (raw as { type?: unknown }).type
  if (type === 'previous_assistant') return { type: 'previous_assistant' }
  if (type === 'literal') {
    const text = (raw as { text?: unknown }).text
    if (typeof text === 'string' && text.trim()) {
      return { type: 'literal', text: text.trim().slice(0, 9500) }
    }
    throw new ActionPlanValidationError('bodySource literal requiere text no vacío.')
  }
  return { type: 'summaries' }
}

function validateEmailAction(raw: Record<string, unknown>, index: number): PlannedEmailAction {
  const ref =
    typeof raw.ref === 'string' && raw.ref.trim()
      ? raw.ref.trim().slice(0, 40)
      : `email-${index + 1}`

  const to = assertCorporateEmailList(raw.to, 'Destinatarios', { required: true, max: 20 })
  const cc = assertCorporateEmailList(raw.cc, 'CC', { max: 20 })
  const subject = assertNonEmptyString(raw.subject, 'Asunto', 300)
  const bodySource = parseBodySource(raw.bodySource)

  return { kind: 'email', ref, to, cc, subject, bodySource }
}

function validateIsoDateTime(raw: unknown, fieldLabel: string): string {
  const value = assertNonEmptyString(raw, fieldLabel, 40)
  try {
    return parseAssistantCalendarDateTime(value, DEFAULT_CALENDAR_TIMEZONE)
  } catch {
    throw new ActionPlanValidationError(`${fieldLabel} debe ser ISO 8601 válido.`)
  }
}

function validateCalendarAction(
  raw: Record<string, unknown>,
  index: number,
): PlannedCalendarAction {
  const ref =
    typeof raw.ref === 'string' && raw.ref.trim()
      ? raw.ref.trim().slice(0, 40)
      : `event-${index + 1}`

  const title = assertNonEmptyString(raw.title, 'Título del evento', 200)
  const startDateTime = validateIsoDateTime(raw.startDateTime, 'Inicio')
  const endDateTime = validateIsoDateTime(raw.endDateTime, 'Fin')
  const { startMs, endMs } = floatingRangeToMs(startDateTime, endDateTime, DEFAULT_CALENDAR_TIMEZONE)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new ActionPlanValidationError(
      `Evento "${title}": la hora de fin debe ser posterior a la de inicio.`,
    )
  }

  const attendees = assertEmailList(raw.attendees, 'Invitados', { max: 20 })
  const addGoogleMeet = raw.addGoogleMeet === true
  const location =
    typeof raw.location === 'string' && raw.location.trim()
      ? raw.location.trim().slice(0, 300)
      : null
  const description =
    typeof raw.description === 'string' ? raw.description.trim().slice(0, 4000) : undefined

  return {
    kind: 'calendar_event',
    ref,
    title,
    startDateTime,
    endDateTime,
    attendees,
    location,
    addGoogleMeet,
    description,
  }
}

function validateCalendarCancelAction(
  raw: Record<string, unknown>,
  index: number,
  catalog?: CalendarEventCatalogEntry[],
): PlannedCalendarCancelAction {
  const ref =
    typeof raw.ref === 'string' && raw.ref.trim()
      ? raw.ref.trim().slice(0, 40)
      : `cancel-${index + 1}`

  const eventId = assertNonEmptyString(raw.eventId, 'ID del evento', 200)
  const title = assertNonEmptyString(raw.title, 'Título del evento', 200)
  const startDateTime = validateIsoDateTime(raw.startDateTime, 'Inicio')
  const endDateTime = validateIsoDateTime(raw.endDateTime, 'Fin')
  const attendees = assertEmailList(raw.attendees, 'Invitados', { max: 20 })

  if (catalog && catalog.length > 0) {
    const match = catalog.find((entry) => entry.eventId === eventId)
    if (!match) {
      throw new ActionPlanValidationError(
        `Cancelación "${title}": el evento no está en la agenda consultada.`,
      )
    }
  }

  return {
    kind: 'calendar_cancel',
    ref,
    eventId,
    title,
    startDateTime,
    endDateTime,
    attendees,
  }
}

function validatePlannedAction(
  raw: unknown,
  index: number,
  catalog?: CalendarEventCatalogEntry[],
): PlannedAction {
  if (!raw || typeof raw !== 'object') {
    throw new ActionPlanValidationError(`Acción ${index + 1} inválida.`)
  }
  const record = raw as Record<string, unknown>
  const kind = record.kind
  if (kind === 'email') return validateEmailAction(record, index)
  if (kind === 'calendar_event') return validateCalendarAction(record, index)
  if (kind === 'calendar_cancel') return validateCalendarCancelAction(record, index, catalog)
  throw new ActionPlanValidationError(`Acción ${index + 1}: kind desconocido "${String(kind)}".`)
}

function actionRef(raw: unknown, index: number): string {
  if (raw && typeof raw === 'object' && typeof (raw as { ref?: unknown }).ref === 'string') {
    const ref = (raw as { ref: string }).ref.trim()
    if (ref) return ref.slice(0, 40)
  }
  return `action-${index + 1}`
}

export function validateActionPlan(
  raw: unknown,
  options?: { calendarEventsCatalog?: CalendarEventCatalogEntry[] },
): ValidatedActionPlanResult {
  const catalog = options?.calendarEventsCatalog
  if (!raw || typeof raw !== 'object') {
    throw new ActionPlanValidationError('El plan de acciones está vacío o es inválido.')
  }

  const record = raw as Record<string, unknown>
  const actionsRaw = record.actions
  if (!Array.isArray(actionsRaw) || actionsRaw.length === 0) {
    throw new ActionPlanValidationError('El plan no contiene acciones.')
  }
  if (actionsRaw.length > MAX_PLAN_ACTIONS) {
    throw new ActionPlanValidationError(
      `El plan supera el máximo de ${MAX_PLAN_ACTIONS} acciones por pedido.`,
    )
  }

  const actions: PlannedAction[] = []
  const validationFailures: ActionPlanValidationFailure[] = []

  actionsRaw.forEach((item, index) => {
    try {
      actions.push(validatePlannedAction(item, index, catalog))
    } catch (err) {
      validationFailures.push({
        ref: actionRef(item, index),
        errorCode: 'PLAN_VALIDATION',
        message: err instanceof Error ? err.message : 'Acción inválida.',
      })
    }
  })

  if (actions.length === 0) {
    throw new ActionPlanValidationError(
      validationFailures[0]?.message ?? 'Ninguna acción del plan pasó la validación.',
    )
  }

  const assumptions = Array.isArray(record.assumptions)
    ? record.assumptions
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 300))
    : undefined

  return {
    plan: { actions, assumptions },
    validationFailures,
  }
}
