import { prepareCalendarCancelDraftTool } from '../assistant-actions/prepareCalendarCancelDraft.js'
import { prepareCalendarDraftTool } from '../assistant-actions/prepareCalendarDraft.js'
import { prepareEmailDraftTool } from '../assistant-actions/prepareEmailDraft.js'
import {
  findPlanInternalCalendarConflicts,
  type CalendarConflict,
  type PlanCalendarEvent,
} from '../assistant-actions/calendarConflicts.js'
import type { AssistantPendingActionDto } from '../assistant-actions/types.js'
import {
  MAX_SYNC_PREPARE_ACTIONS,
  PREPARE_DEADLINE_MS,
  type ActionContext,
  type ActionPlan,
  type BodySource,
  type PlannedAction,
  type PlannedCalendarAction,
  type PlannedCalendarCancelAction,
  type PrepareBatchResult,
  type PreparationResult,
} from './actionPlanTypes.js'
import type { RagToolContext } from './executeRagTool.js'

function resolveBody(source: BodySource, context: ActionContext): string {
  switch (source.type) {
    case 'summaries':
      return (context.summariesText ?? '').slice(0, 9500)
    case 'previous_assistant':
      return (context.previousAssistantText ?? '').slice(0, 9500)
    case 'literal':
      return source.text.slice(0, 9500)
    default:
      return ''
  }
}

function formatTimeRange(start: string, end: string): string {
  const startTime = start.includes('T') ? start.slice(11, 16) : start
  const endTime = end.includes('T') ? end.slice(11, 16) : end
  return `${startTime}–${endTime}`
}

async function prepareOneAction(input: {
  action: PlannedAction
  ctx: RagToolContext
  actionContext: ActionContext
  planConflictMap: Map<string, CalendarConflict[]>
}): Promise<PreparationResult> {
  const { action, ctx, actionContext, planConflictMap } = input

  try {
    if (action.kind === 'email') {
      const body = resolveBody(action.bodySource, actionContext)
      if (body.trim().length < 10) {
        return {
          ref: action.ref,
          ok: false,
          errorCode: 'EMAIL_BODY_EMPTY',
          message: `Correo "${action.subject}": no hay contenido disponible para el cuerpo.`,
        }
      }

      const result = await prepareEmailDraftTool({
        userId: ctx.userId,
        userEmail: ctx.userEmail,
        impersonateAs: ctx.searchSubject,
        args: {
          to: action.to,
          cc: action.cc ?? [],
          subject: action.subject,
          body,
        },
      })

      if (
        result.requiresConfirmation === true &&
        typeof result.pendingActionId === 'string' &&
        result.preview &&
        typeof result.preview === 'object'
      ) {
        ctx.pendingActions.push({
          id: result.pendingActionId,
          type: 'email',
          status: 'pending',
          preview: result.preview as AssistantPendingActionDto['preview'],
          expiresAt:
            typeof result.expiresAt === 'string'
              ? result.expiresAt
              : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        })
        return {
          ref: action.ref,
          ok: true,
          pendingActionId: result.pendingActionId,
          type: 'email',
          label: `Correo a ${action.to.join(', ')} — "${action.subject}"`,
        }
      }

      return {
        ref: action.ref,
        ok: false,
        errorCode: 'EMAIL_DRAFT_FAILED',
        message:
          typeof result.message === 'string'
            ? result.message
            : `No se pudo preparar el correo "${action.subject}".`,
      }
    }

    if (action.kind === 'calendar_cancel') {
      const cancelAction = action as PlannedCalendarCancelAction
      const result = await prepareCalendarCancelDraftTool({
        userId: ctx.userId,
        userEmail: ctx.userEmail,
        impersonateAs: ctx.searchSubject,
        args: {
          eventId: cancelAction.eventId,
          title: cancelAction.title,
          startDateTime: cancelAction.startDateTime,
          endDateTime: cancelAction.endDateTime,
          attendees: cancelAction.attendees,
        },
      })

      if (
        result.requiresConfirmation === true &&
        typeof result.pendingActionId === 'string' &&
        result.preview &&
        typeof result.preview === 'object'
      ) {
        ctx.pendingActions.push({
          id: result.pendingActionId,
          type: 'calendar_cancel',
          status: 'pending',
          preview: result.preview as AssistantPendingActionDto['preview'],
          expiresAt:
            typeof result.expiresAt === 'string'
              ? result.expiresAt
              : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        })
        const inviteNote =
          cancelAction.attendees.length > 0
            ? ` — invitados: ${cancelAction.attendees.join(', ')}`
            : ''
        return {
          ref: cancelAction.ref,
          ok: true,
          pendingActionId: result.pendingActionId,
          type: 'calendar_cancel',
          label: `Cancelar "${cancelAction.title}" ${formatTimeRange(cancelAction.startDateTime, cancelAction.endDateTime)}${inviteNote}`,
        }
      }

      return {
        ref: cancelAction.ref,
        ok: false,
        errorCode: 'CALENDAR_CANCEL_DRAFT_FAILED',
        message:
          typeof result.message === 'string'
            ? result.message
            : `No se pudo preparar la cancelación de "${cancelAction.title}".`,
      }
    }

    const planConflicts = planConflictMap.get(action.ref) ?? []

    const result = await prepareCalendarDraftTool({
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      impersonateAs: ctx.searchSubject,
      args: {
        title: action.title,
        startDateTime: action.startDateTime,
        endDateTime: action.endDateTime,
        description: action.description ?? 'Evento preparado desde el asistente BacarNet.',
        location: action.location ?? null,
        attendees: action.attendees,
        addGoogleMeet: action.addGoogleMeet,
        planConflicts,
      },
    })

    if (
      result.requiresConfirmation === true &&
      typeof result.pendingActionId === 'string' &&
      result.preview &&
      typeof result.preview === 'object'
    ) {
      ctx.pendingActions.push({
        id: result.pendingActionId,
        type: 'calendar_event',
        status: 'pending',
        preview: result.preview as AssistantPendingActionDto['preview'],
        expiresAt:
          typeof result.expiresAt === 'string'
            ? result.expiresAt
            : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      })

      const meetNote = action.addGoogleMeet ? ' (Meet)' : ''
      const inviteNote =
        action.attendees.length > 0 ? ` — invitados: ${action.attendees.join(', ')}` : ''
      return {
        ref: action.ref,
        ok: true,
        pendingActionId: result.pendingActionId,
        type: 'calendar_event',
        label: `Evento "${action.title}" ${formatTimeRange(action.startDateTime, action.endDateTime)}${meetNote}${inviteNote}`,
      }
    }

    return {
      ref: action.ref,
      ok: false,
      errorCode: 'CALENDAR_DRAFT_FAILED',
      message:
        typeof result.message === 'string'
          ? result.message
          : `No se pudo preparar el evento "${action.title}".`,
    }
  } catch (err) {
    return {
      ref: action.ref,
      ok: false,
      errorCode: 'PREPARE_EXCEPTION',
      message: err instanceof Error ? err.message : 'Error al preparar la acción.',
    }
  }
}

export async function prepareActionBatch(input: {
  plan: ActionPlan
  ctx: RagToolContext
  actionContext: ActionContext
  toolsUsed: string[]
  deadlineMs?: number
}): Promise<PrepareBatchResult> {
  const deadlineMs = input.deadlineMs ?? PREPARE_DEADLINE_MS
  const startedAt = Date.now()

  const syncActions = input.plan.actions.slice(0, MAX_SYNC_PREPARE_ACTIONS)
  const deferredRefs = input.plan.actions.slice(MAX_SYNC_PREPARE_ACTIONS).map((action) => action.ref)

  input.toolsUsed.push('orchestrated_prepare_action_batch')

  const planEvents: PlanCalendarEvent[] = syncActions
    .filter((action): action is PlannedCalendarAction => action.kind === 'calendar_event')
    .map((action) => ({
      ref: action.ref,
      title: action.title,
      startDateTime: action.startDateTime,
      endDateTime: action.endDateTime,
    }))
  const planConflictMap = findPlanInternalCalendarConflicts(planEvents)

  const settled = await Promise.all(
    syncActions.map(async (action) => {
      if (Date.now() - startedAt > deadlineMs) {
        return {
          ref: action.ref,
          ok: false as const,
          errorCode: 'PREPARE_TIMEOUT',
          message: `No se alcanzó a preparar "${action.ref}" por límite de tiempo.`,
        }
      }
      return prepareOneAction({
        action,
        ctx: input.ctx,
        actionContext: input.actionContext,
        planConflictMap,
      })
    }),
  )

  return {
    results: settled,
    deferredRefs,
  }
}

export function buildActionPlanAnswer(input: {
  plan: ActionPlan
  batch: PrepareBatchResult
  includeSummariesIntro?: boolean
  validationFailures?: Array<{ ref: string; message: string }>
}): string {
  const ok = input.batch.results.filter((result) => result.ok)
  const fail = input.batch.results.filter((result) => !result.ok)
  const validationFails = input.validationFailures ?? []
  const total = input.plan.actions.length + validationFails.length
  const parts: string[] = []

  if (input.includeSummariesIntro) {
    parts.push('Acá van los resúmenes solicitados. También preparé las acciones indicadas:')
  }

  if (ok.length === 0 && fail.length === 0 && input.batch.deferredRefs.length === 0) {
    return 'No encontré acciones concretas para preparar en tu pedido.'
  }

  if (ok.length > 0) {
    parts.push(
      `Preparé **${ok.length} de ${total}** acciones. Revisá cada tarjeta antes de confirmar:`,
    )
    for (const item of ok) {
      if (item.ok) parts.push(`- ${item.label}`)
    }
  } else {
    parts.push(`No pude preparar ninguna de las ${total} acciones solicitadas.`)
  }

  if (fail.length > 0 || validationFails.length > 0) {
    parts.push('', '**No se pudo preparar:**')
    for (const item of fail) {
      if (!item.ok) parts.push(`- ${item.message}`)
    }
    for (const item of validationFails) {
      parts.push(`- ${item.message}`)
    }
  }

  if (input.batch.deferredRefs.length > 0) {
    parts.push(
      '',
      `_Quedaron **${input.batch.deferredRefs.length}** acción(es) pendientes por límite de preparación simultánea (${MAX_SYNC_PREPARE_ACTIONS} por mensaje). Pedime continuar con el resto._`,
    )
  }

  if (input.plan.assumptions && input.plan.assumptions.length > 0) {
    parts.push('', '_Supuestos:_ ' + input.plan.assumptions.join(' '))
  }

  return parts.join('\n')
}

export function preparationFailuresFromBatch(
  batch: PrepareBatchResult,
): Array<{ ref: string; message: string; errorCode: string }> {
  return batch.results
    .filter((result): result is Extract<PreparationResult, { ok: false }> => !result.ok)
    .map((result) => ({
      ref: result.ref,
      message: result.message,
      errorCode: result.errorCode,
    }))
}
