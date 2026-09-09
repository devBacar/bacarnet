import { listCalendarEventsTool } from '../assistant-actions/calendarReadTools.js'
import { todayInTimeZone } from '../assistant-actions/calendarDateTime.js'
import type { ActionContext, CalendarEventCatalogEntry } from './actionPlanTypes.js'
import { inferCalendarCancelRange } from './assistantIntent.js'
import { extractActionPlan, ActionPlanValidationError } from './extractActionPlan.js'
import {
  buildActionPlanAnswer,
  prepareActionBatch,
  preparationFailuresFromBatch,
} from './prepareActionBatch.js'
import type { RagToolContext } from './executeRagTool.js'
import type { RagConversationTurn } from './runRagAssistant.js'
import type { QuestionIntent } from './assistantIntent.js'

function extractPreviousAssistantContent(history: RagConversationTurn[]): string | undefined {
  const lastAssistant = [...history].reverse().find((turn) => turn.role === 'assistant')
  const content = lastAssistant?.content?.trim()
  return content && content.length >= 10 ? content : undefined
}

export function extractSummaryBodyFromHistory(history: RagConversationTurn[]): string | undefined {
  const assistantMessages = history
    .filter((turn) => turn.role === 'assistant')
    .map((turn) => turn.content)
    .reverse()

  for (const content of assistantMessages) {
    if (content.length > 200) return content
  }
  return assistantMessages[0]
}

function buildActionContext(input: {
  history: RagConversationTurn[]
  summariesText?: string
}): ActionContext {
  return {
    referenceDate: todayInTimeZone(),
    summariesText: input.summariesText,
    previousAssistantText: extractPreviousAssistantContent(input.history),
  }
}

export function wantsActionPlan(intent: QuestionIntent): boolean {
  return intent.wantsEmail || intent.wantsCalendar || intent.wantsCalendarCancel
}

function mapEventsCatalog(result: Record<string, unknown>): CalendarEventCatalogEntry[] {
  const events = Array.isArray(result.events)
    ? (result.events as Array<{
        eventId?: string | null
        title?: string
        start?: string
        end?: string | null
        attendees?: string[]
        allDay?: boolean
      }>)
    : []
  return events
    .filter((event): event is typeof event & { eventId: string } => Boolean(event.eventId?.trim()))
    .map((event) => ({
      eventId: event.eventId!.trim(),
      title: event.title?.trim() || '(Sin título)',
      start: event.start?.trim() || '',
      end: event.end?.trim() ?? null,
      attendees: Array.isArray(event.attendees) ? event.attendees : [],
      allDay: event.allDay === true,
    }))
}

export async function runActionPlanOrchestrator(input: {
  question: string
  history: RagConversationTurn[]
  intent: QuestionIntent
  toolCtx: RagToolContext
  toolsUsed: string[]
  summariesText?: string
  includeSummariesIntro?: boolean
}): Promise<{
  handled: boolean
  answer: string
  preparationFailures: Array<{ ref: string; message: string; errorCode: string }>
  deferredActionRefs: string[]
}> {
  if (!wantsActionPlan(input.intent)) {
    return { handled: false, answer: '', preparationFailures: [], deferredActionRefs: [] }
  }

  let actionContext = buildActionContext({
    history: input.history,
    summariesText: input.summariesText,
  })

  if (input.intent.wantsCalendarCancel) {
    input.toolsUsed.push('orchestrated_list_calendar_for_cancel')
    const range = inferCalendarCancelRange(input.question, input.history)
    const calendarResult = await listCalendarEventsTool({
      impersonateAs: input.toolCtx.searchSubject,
      args: {
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      },
    })
    if (typeof calendarResult.error === 'string') {
      return {
        handled: true,
        answer:
          typeof calendarResult.message === 'string'
            ? calendarResult.message
            : 'No pude consultar tu calendario para preparar la cancelación.',
        preparationFailures: [],
        deferredActionRefs: [],
      }
    }
    const catalog = mapEventsCatalog(calendarResult)
    if (catalog.length === 0) {
      return {
        handled: true,
        answer: 'No encontré eventos en tu agenda para ese período.',
        preparationFailures: [],
        deferredActionRefs: [],
      }
    }
    actionContext = {
      ...actionContext,
      calendarEventsCatalog: catalog,
    }
  }

  input.toolsUsed.push('orchestrated_extract_action_plan')

  let extracted
  try {
    extracted = await extractActionPlan({
      question: input.question,
      history: input.history,
      context: actionContext,
      usageMeter: input.toolCtx.usageMeter,
    })
  } catch (err) {
    if (err instanceof ActionPlanValidationError) {
      return {
        handled: true,
        answer: err.message,
        preparationFailures: [],
        deferredActionRefs: [],
      }
    }
    return { handled: false, answer: '', preparationFailures: [], deferredActionRefs: [] }
  }

  const plan = extracted.plan
  const validationFailures = extracted.validationFailures.map((failure) => ({
    ref: failure.ref,
    message: failure.message,
    errorCode: failure.errorCode,
  }))

  if (plan.actions.length === 0) {
    return {
      handled: validationFailures.length > 0,
      answer:
        validationFailures.length > 0
          ? buildActionPlanAnswer({
              plan: { actions: [], assumptions: plan.assumptions },
              batch: { results: [], deferredRefs: [] },
            }) +
            '\n\n' +
            validationFailures.map((failure) => `- ${failure.message}`).join('\n')
          : '',
      preparationFailures: validationFailures,
      deferredActionRefs: [],
    }
  }

  const batch = await prepareActionBatch({
    plan,
    ctx: input.toolCtx,
    actionContext,
    toolsUsed: input.toolsUsed,
  })

  const preparationFailures = [
    ...validationFailures,
    ...preparationFailuresFromBatch(batch),
  ]
  const okCount = batch.results.filter((result) => result.ok).length

  if (okCount === 0 && preparationFailures.length === 0 && batch.deferredRefs.length === 0) {
    return { handled: false, answer: '', preparationFailures: [], deferredActionRefs: [] }
  }

  return {
    handled: true,
    answer: buildActionPlanAnswer({
      plan,
      batch,
      includeSummariesIntro: input.includeSummariesIntro,
      validationFailures,
    }),
    preparationFailures,
    deferredActionRefs: batch.deferredRefs,
  }
}
