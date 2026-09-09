import { parseCalendarFromNaturalLanguage } from '../assistant-actions/parseCalendarRequest.js'
import { prepareCalendarDraftTool } from '../assistant-actions/prepareCalendarDraft.js'
import { prepareEmailDraftTool } from '../assistant-actions/prepareEmailDraft.js'
import { analyzeQuestionIntent, type QuestionIntent } from './assistantIntent.js'
import type { RagToolContext } from './executeRagTool.js'
import type { RagConversationTurn } from './runRagAssistant.js'

function extractCorporateEmails(text: string): string[] {
  const matches = text.match(/[\w.+-]+@bacarsa\.com\.ar/gi) ?? []
  return [...new Set(matches.map((email) => email.toLowerCase()))]
}

function extractSummaryBodyFromHistory(history: RagConversationTurn[]): string {
  const assistantMessages = history
    .filter((turn) => turn.role === 'assistant')
    .map((turn) => turn.content)
    .reverse()

  for (const content of assistantMessages) {
    if (content.length > 200) return content
  }
  return assistantMessages[0] ?? 'Resúmenes de documentos del área Sistemas.'
}

function extractEmailSubject(question: string): string | null {
  const quoted =
    /asunto\s+"([^"]+)"/i.exec(question) ?? /asunto\s+'([^']+)'/i.exec(question)
  return quoted?.[1]?.trim() ?? null
}

function extractPreviousAssistantContent(history: RagConversationTurn[]): string | null {
  const lastAssistant = [...history].reverse().find((turn) => turn.role === 'assistant')
  const content = lastAssistant?.content?.trim()
  return content && content.length >= 10 ? content : null
}

export async function tryPrepareEmailFromHistory(input: {
  question: string
  history: RagConversationTurn[]
  toolCtx: RagToolContext
  toolsUsed: string[]
}): Promise<{ answer: string; handled: boolean } | null> {
  const body = extractPreviousAssistantContent(input.history)
  if (!body) return null

  const recentUserText = input.history
    .filter((turn) => turn.role === 'user')
    .slice(-3)
    .map((turn) => turn.content)
    .join('\n')
  const contextText = `${recentUserText}\n${input.question}`
  const recipients = extractCorporateEmails(contextText)
  if (recipients.length === 0) return null

  const subject =
    extractEmailSubject(input.question) ?? 'Mensaje desde Asistente BacarNet'

  input.toolsUsed.push('orchestrated_prepare_email')
  const emailResult = await prepareEmailDraftTool({
    userId: input.toolCtx.userId,
    userEmail: input.toolCtx.userEmail,
    impersonateAs: input.toolCtx.searchSubject,
    args: {
      to: recipients,
      subject,
      body: body.slice(0, 9500),
    },
  })

  if (
    emailResult.requiresConfirmation === true &&
    typeof emailResult.pendingActionId === 'string'
  ) {
    input.toolCtx.pendingActions.push({
      id: emailResult.pendingActionId,
      type: 'email',
      status: 'pending',
      preview: emailResult.preview as (typeof input.toolCtx.pendingActions)[number]['preview'],
      expiresAt:
        typeof emailResult.expiresAt === 'string'
          ? emailResult.expiresAt
          : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    return {
      handled: true,
      answer: `Preparé un borrador de correo para ${recipients.join(', ')} con asunto "${subject}" y el contenido de mi respuesta anterior. Confirmalo en la tarjeta de abajo.`,
    }
  }

  if (typeof emailResult.message === 'string') {
    return { handled: true, answer: emailResult.message }
  }

  return null
}

export async function tryRunCombinedActions(input: {
  question: string
  history: RagConversationTurn[]
  intent: QuestionIntent
  toolCtx: RagToolContext
  toolsUsed: string[]
  summaryBody?: string
}): Promise<{ answer: string; handled: boolean } | null> {
  if (!input.intent.wantsEmail && !input.intent.wantsCalendar) return null

  const summaryBody = (input.summaryBody ?? extractSummaryBodyFromHistory(input.history)).slice(
    0,
    9500,
  )
  if (summaryBody.length < 120) return null

  const parts: string[] = []
  const recentUserText = input.history
    .filter((turn) => turn.role === 'user')
    .slice(-3)
    .map((turn) => turn.content)
    .join('\n')
  const contextText = `${recentUserText}\n${input.question}`
  const recipients = extractCorporateEmails(contextText)

  if (input.intent.wantsEmail && recipients.length > 0) {
    input.toolsUsed.push('orchestrated_prepare_email')
    const subject =
      extractEmailSubject(input.question) ?? 'Resúmenes de documentos — Sistemas'
    const emailResult = await prepareEmailDraftTool({
      userId: input.toolCtx.userId,
      userEmail: input.toolCtx.userEmail,
      impersonateAs: input.toolCtx.searchSubject,
      args: {
        to: recipients,
        subject,
        body: summaryBody,
      },
    })

    if (emailResult.requiresConfirmation === true && typeof emailResult.pendingActionId === 'string') {
      input.toolCtx.pendingActions.push({
        id: emailResult.pendingActionId,
        type: 'email',
        status: 'pending',
        preview: emailResult.preview as (typeof input.toolCtx.pendingActions)[number]['preview'],
        expiresAt:
          typeof emailResult.expiresAt === 'string'
            ? emailResult.expiresAt
            : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      })
      parts.push(
        `Preparé un borrador de correo para ${recipients.join(', ')} con los resúmenes. Confirmalo en la tarjeta de abajo.`,
      )
    } else if (typeof emailResult.message === 'string') {
      parts.push(emailResult.message)
    }
  }

  if (input.intent.wantsCalendar) {
    const calendarDraft = parseCalendarFromNaturalLanguage(contextText)
    if (calendarDraft) {
      input.toolsUsed.push('orchestrated_prepare_calendar')
      const calendarResult = await prepareCalendarDraftTool({
        userId: input.toolCtx.userId,
        userEmail: input.toolCtx.userEmail,
        impersonateAs: input.toolCtx.searchSubject,
        args: {
          title: calendarDraft.title,
          startDateTime: calendarDraft.startDateTime,
          endDateTime: calendarDraft.endDateTime,
          description: calendarDraft.description,
          attendees: calendarDraft.attendees,
          addGoogleMeet: calendarDraft.addGoogleMeet,
        },
      })

      if (
        calendarResult.requiresConfirmation === true &&
        typeof calendarResult.pendingActionId === 'string'
      ) {
        input.toolCtx.pendingActions.push({
          id: calendarResult.pendingActionId,
          type: 'calendar_event',
          status: 'pending',
          preview: calendarResult.preview as (typeof input.toolCtx.pendingActions)[number]['preview'],
          expiresAt:
            typeof calendarResult.expiresAt === 'string'
              ? calendarResult.expiresAt
              : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        })
        const meetNote = calendarDraft.addGoogleMeet ? ' con enlace de Google Meet' : ''
        const inviteNote =
          calendarDraft.attendees.length > 0
            ? ` e invité a ${calendarDraft.attendees.join(', ')}`
            : ''
        parts.push(
          `Preparé el evento "${calendarDraft.title}" para mañana ${calendarDraft.startDateTime.slice(11, 16)}–${calendarDraft.endDateTime.slice(11, 16)}${meetNote}${inviteNote}. Confirmalo en la tarjeta.`,
        )
      } else if (typeof calendarResult.message === 'string') {
        parts.push(calendarResult.message)
      }
    }
  }

  if (parts.length === 0) return null

  return {
    handled: true,
    answer: parts.join('\n\n'),
  }
}

export function inferIntentFromConversation(
  question: string,
  history: RagConversationTurn[],
): QuestionIntent {
  const direct = analyzeQuestionIntent(question)
  if (
    direct.wantsSummarize ||
    direct.wantsEmail ||
    direct.wantsCalendar ||
    direct.wantsCalendarRead ||
    direct.wantsCalendarCancel ||
    direct.wantsGmailInboxToday
  ) {
    return direct
  }

  if (
    !/\b(hacelo|hacé|dale|bueno|entonce|confirm|cancela\s+todo|cancelá\s+todo)/i.test(question)
  ) {
    return direct
  }

  const recentUserText = history
    .filter((turn) => turn.role === 'user')
    .slice(-3)
    .map((turn) => turn.content)
    .join('\n')

  if (!recentUserText.trim()) return direct
  return analyzeQuestionIntent(`${recentUserText}\n${question}`)
}
