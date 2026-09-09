import type { drive_v3 } from 'googleapis'
import type { RagCitation } from './generateRagAnswer.js'
import type { LoadedRagCorpus } from './loadRagCorpus.js'
import { buildRagToolDeclarations } from './ragToolDeclarations.js'
import {
  buildAssistantSystemInstruction,
  executeRagTool,
  type RagToolContext,
} from './executeRagTool.js'
import { callVertexGemini, type GeminiContent } from './vertexGemini.js'
import type { RagConfig } from './types.js'
import type { AssistantPendingActionDto } from '../assistant-actions/types.js'
import {
  analyzeQuestionIntent,
  buildOrchestratorHint,
  historyHasRecentSummaries,
  parseCalendarReadRange,
  userFrustratedWithClarification,
} from './assistantIntent.js'
import {
  inferIntentFromConversation,
  tryPrepareEmailFromHistory,
} from './runCombinedAssistantActions.js'
import { runActionPlanOrchestrator, wantsActionPlan, extractSummaryBodyFromHistory } from './runActionPlanOrchestrator.js'
import {
  formatSummariesAsAnswer,
  formatFileListAsAnswer,
  formatInboxAsAnswer,
  formatCalendarAsAnswer,
} from './formatAssistantAnswers.js'
import { listAccessibleFilesTool } from './listAccessibleFiles.js'
import { listInboxTodayTool } from '../assistant-actions/gmailReadTools.js'
import { runSummarizeBatch, MAX_SUMMARIZE_BATCH } from './runSummarizeBatch.js'
import { listCalendarEventsTool } from '../assistant-actions/calendarReadTools.js'
import {
  createAssistantUsageMeter,
  type AssistantInteractionUsage,
} from './assistantUsageMeter.js'

const MAX_TOOL_ROUNDS = 8
const MAX_HISTORY_TURNS = 10

export type RagConversationTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type RagAssistantResult = {
  answer: string
  citations: RagCitation[]
  toolsUsed: string[]
  pendingActions: AssistantPendingActionDto[]
  preparationFailures?: Array<{ ref: string; message: string; errorCode: string }>
  deferredActionRefs?: string[]
  preparationBatchId?: string | null
  usage?: AssistantInteractionUsage
}

function buildContentsFromHistory(
  history: RagConversationTurn[],
  question: string,
): GeminiContent[] {
  const contents: GeminiContent[] = []
  const trimmedHistory = history
    .filter((turn) => turn.content.trim().length > 0)
    .slice(-MAX_HISTORY_TURNS)

  for (const turn of trimmedHistory) {
    contents.push({
      role: turn.role === 'user' ? 'user' : 'model',
      parts: [{ text: turn.content.trim() }],
    })
  }

  contents.push({
    role: 'user',
    parts: [{ text: question.trim() }],
  })

  return contents
}

async function runGeminiAssistantLoop(input: {
  question: string
  history: RagConversationTurn[]
  toolCtx: RagToolContext
  config: RagConfig
  accessibleAreaLabels: string[]
  isSuperAdmin: boolean
  preToolsUsed: string[]
  correctionsBlock?: string
  usageMeter: ReturnType<typeof createAssistantUsageMeter>
}): Promise<{ answer: string; toolsUsed: string[] }> {
  const toolsUsed = [...input.preToolsUsed]
  const contents = buildContentsFromHistory(input.history, input.question)
  const tools = buildRagToolDeclarations(input.isSuperAdmin)
  const systemInstruction = buildAssistantSystemInstruction({
    config: input.config,
    accessibleAreaLabels: input.accessibleAreaLabels,
    isSuperAdmin: input.isSuperAdmin,
    userFrustrated: userFrustratedWithClarification(input.history),
    correctionsBlock: input.correctionsBlock,
  })

  let answer = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const result = await callVertexGemini({
      systemInstruction,
      contents,
      tools,
      temperature: 0.2,
      maxOutputTokens: 1536,
      usageMeter: input.usageMeter,
    })

    if (result.functionCalls.length === 0) {
      answer = result.text
      break
    }

    contents.push({
      role: 'model',
      parts: result.functionCalls.map((call) => ({
        functionCall: { name: call.name, args: call.args },
      })),
    })

    const responseParts: Array<{ functionResponse: { name: string; response: Record<string, unknown> } }> =
      []

    for (const call of result.functionCalls) {
      toolsUsed.push(call.name)
      const response = await executeRagTool(input.toolCtx, call.name, call.args)
      responseParts.push({
        functionResponse: {
          name: call.name,
          response,
        },
      })
    }

    contents.push({
      role: 'user',
      parts: responseParts,
    })

    if (round === MAX_TOOL_ROUNDS - 1) {
      const final = await callVertexGemini({
        systemInstruction,
        contents,
        temperature: 0.2,
        maxOutputTokens: 1536,
        usageMeter: input.usageMeter,
      })
      answer = final.text
    }
  }

  if (!answer.trim()) {
    answer = 'No pude generar una respuesta para esa consulta.'
  }

  return { answer: answer.trim(), toolsUsed }
}

export async function runRagAssistant(input: {
  question: string
  history?: RagConversationTurn[]
  config: RagConfig
  searchSubject: string
  drive: drive_v3.Drive
  corpus: LoadedRagCorpus
  isSuperAdmin: boolean
  accessibleAreaLabels: string[]
  userId: string
  userEmail: string
}): Promise<RagAssistantResult> {
  const citations: RagCitation[] = []
  const toolsUsed: string[] = []
  const pendingActions: AssistantPendingActionDto[] = []
  const usageMeter = createAssistantUsageMeter()
  const withUsage = (result: Omit<RagAssistantResult, 'usage'>): RagAssistantResult => ({
    ...result,
    usage: usageMeter.snapshot(),
  })
  const history = input.history ?? []
  const toolCtx: RagToolContext = {
    config: input.config,
    searchSubject: input.searchSubject,
    userId: input.userId,
    userEmail: input.userEmail,
    drive: input.drive,
    corpus: input.corpus,
    citations,
    isSuperAdmin: input.isSuperAdmin,
    accessibleAreaLabels: input.accessibleAreaLabels,
    pendingActions,
    usageMeter,
  }

  const intent = inferIntentFromConversation(input.question, history)
  let questionForModel = input.question

  if (
    intent.wantsListFiles &&
    !intent.wantsSummarize &&
    !intent.wantsEmail &&
    !intent.wantsCalendar &&
    !intent.wantsCalendarRead &&
    !intent.wantsCalendarCancel
  ) {
    toolsUsed.push('orchestrated_list_files')
    const listResult = await listAccessibleFilesTool({
      drive: input.drive,
      config: input.config,
      searchSubject: input.searchSubject,
      args: {},
    })
    return withUsage({
      answer: formatFileListAsAnswer(listResult),
      citations,
      toolsUsed,
      pendingActions,
    })
  }

  if (
    intent.wantsGmailInboxToday &&
    !intent.wantsSummarize &&
    !intent.wantsEmail &&
    !intent.wantsCalendar &&
    !intent.wantsCalendarRead &&
    !intent.wantsCalendarCancel
  ) {
    toolsUsed.push('orchestrated_list_inbox_today')
    const inboxResult = await listInboxTodayTool({
      impersonateAs: input.searchSubject,
      args: {},
    })
    return withUsage({
      answer: formatInboxAsAnswer(inboxResult),
      citations,
      toolsUsed,
      pendingActions,
    })
  }

  if (
    intent.wantsCalendarRead &&
    !intent.wantsSummarize &&
    !intent.wantsEmail &&
    !intent.wantsCalendar &&
    !intent.wantsCalendarCancel
  ) {
    toolsUsed.push('orchestrated_list_calendar_events')
    const range = parseCalendarReadRange(input.question)
    const calendarResult = await listCalendarEventsTool({
      impersonateAs: input.searchSubject,
      args: {
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      },
    })
    return withUsage({
      answer: formatCalendarAsAnswer(calendarResult),
      citations,
      toolsUsed,
      pendingActions,
    })
  }

  if (intent.wantsEmailFromHistory && !intent.wantsCalendar) {
    const emailFromHistory = await tryPrepareEmailFromHistory({
      question: input.question,
      history,
      toolCtx,
      toolsUsed,
    })
    if (emailFromHistory?.handled) {
      return withUsage({
        answer: emailFromHistory.answer,
        citations,
        toolsUsed,
        pendingActions,
      })
    }
  }

  if (
    wantsActionPlan(intent) &&
    historyHasRecentSummaries(history) &&
    !intent.wantsSummarize
  ) {
    const orchestrated = await runActionPlanOrchestrator({
      question: input.question,
      history,
      intent,
      toolCtx,
      toolsUsed,
      summariesText: extractSummaryBodyFromHistory(history),
    })
    if (orchestrated.handled) {
      return withUsage({
        answer: orchestrated.answer,
        citations,
        toolsUsed,
        pendingActions,
        preparationFailures: orchestrated.preparationFailures,
        deferredActionRefs: orchestrated.deferredActionRefs,
        preparationBatchId: null,
      })
    }
  }

  if (intent.wantsSummarize && intent.summarize) {
    const skipBatchForCombined =
      wantsActionPlan(intent) && historyHasRecentSummaries(history)

    if (skipBatchForCombined) {
      toolsUsed.push('orchestrated_reuse_summaries')
      const orchestrated = await runActionPlanOrchestrator({
        question: input.question,
        history,
        intent,
        toolCtx,
        toolsUsed,
        summariesText: extractSummaryBodyFromHistory(history),
      })
      if (orchestrated.handled) {
        return withUsage({
          answer: orchestrated.answer,
          citations,
          toolsUsed,
          pendingActions,
          preparationFailures: orchestrated.preparationFailures,
          deferredActionRefs: orchestrated.deferredActionRefs,
          preparationBatchId: null,
        })
      }
      questionForModel = [
        input.question,
        '',
        buildOrchestratorHint({
          intent,
          summarizedFiles: [],
          skippedCount: 0,
          reuseFromHistory: true,
        }),
      ].join('\n')
    } else {
      toolsUsed.push('orchestrated_summarize_batch')
      const combinedBatchCap = wantsActionPlan(intent) ? 2 : MAX_SUMMARIZE_BATCH
      try {
        const batch = await runSummarizeBatch(toolCtx, intent.summarize, combinedBatchCap)
        const summariesText = formatSummariesAsAnswer(batch)

        if (wantsActionPlan(intent)) {
          const orchestrated = await runActionPlanOrchestrator({
            question: input.question,
            history,
            intent,
            toolCtx,
            toolsUsed,
            summariesText,
            includeSummariesIntro: batch.summaries.length > 0,
          })
          if (orchestrated.handled) {
            const answer =
              batch.summaries.length > 0 && !orchestrated.answer.includes('resúmenes')
                ? `${summariesText}\n\n${orchestrated.answer}`
                : orchestrated.answer
            return withUsage({
              answer,
              citations,
              toolsUsed,
              pendingActions,
              preparationFailures: orchestrated.preparationFailures,
              deferredActionRefs: orchestrated.deferredActionRefs,
              preparationBatchId: null,
            })
          }
        }

        if (!wantsActionPlan(intent)) {
          return withUsage({
            answer: summariesText,
            citations,
            toolsUsed,
            pendingActions,
          })
        }

        const hint = buildOrchestratorHint({
          intent,
          summarizedFiles: batch.summaries.map((item) => item.fileName),
          skippedCount: batch.skipped.length,
        })
        const compactSummaries = batch.summaries
          .map(
            (item) =>
              `***REMOVED******REMOVED*** ${item.fileName}\n${item.summary.slice(0, 1500)}${item.summary.length > 1500 ? '…' : ''}`,
          )
          .join('\n\n')
        questionForModel = [input.question, '', compactSummaries, '', hint].join('\n')
      } catch (err) {
        const hint = buildOrchestratorHint({
          intent,
          summarizedFiles: [],
          skippedCount: 0,
          reuseFromHistory: historyHasRecentSummaries(history),
        })
        questionForModel = [
          input.question,
          '',
          hint,
          err instanceof Error ? `Nota interna: batch de resúmenes falló (${err.message}).` : '',
        ].join('\n')
      }
    }
  } else if (wantsActionPlan(intent)) {
    const orchestrated = await runActionPlanOrchestrator({
      question: input.question,
      history,
      intent,
      toolCtx,
      toolsUsed,
    })
    if (orchestrated.handled) {
      return withUsage({
        answer: orchestrated.answer,
        citations,
        toolsUsed,
        pendingActions,
        preparationFailures: orchestrated.preparationFailures,
        deferredActionRefs: orchestrated.deferredActionRefs,
        preparationBatchId: null,
      })
    }
  }

  try {
    const loop = await runGeminiAssistantLoop({
      question: questionForModel,
      history,
      toolCtx,
      config: input.config,
      accessibleAreaLabels: input.accessibleAreaLabels,
      isSuperAdmin: input.isSuperAdmin,
      preToolsUsed: toolsUsed,
      usageMeter,
    })

    return withUsage({
      answer: loop.answer,
      citations,
      toolsUsed: loop.toolsUsed,
      pendingActions,
    })
  } catch (err) {
    return withUsage({
      answer:
        'Algo salió mal al armar la respuesta completa. Intentá de nuevo en unos segundos, o pedí el mail y el evento por separado.',
      citations,
      toolsUsed,
      pendingActions,
    })
  }
}
