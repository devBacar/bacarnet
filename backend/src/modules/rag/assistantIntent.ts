import { todayInTimeZone } from '../assistant-actions/calendarDateTime.js'
import { parseCalendarReadRange, type CalendarReadRange } from './parseCalendarReadRange.js'

const SUMMARIZE_RE =
  /\b(resum(e|ir|o|en|ame|á|ar|arios?)|sintetiz(a|ar|á)|hac[eé]\s+(un\s+)?resumen)\b/i
const PDF_RE = /\bpdf\b/i
const WORD_RE = /\b(word|docx|documentos?\s+word)\b/i
const ALL_FILES_RE = /\b(todos?\s*(los\s*)?(archivos?|documentos?)|todos?\s+los\s+pdf)\b/i
const COUNT_RE = /\b(\d{1,2})\s*(pdf|archivos?|documentos?)\b/i
const LIST_FILES_RE =
  /\b(qu[eé]\s+archivos|list(a|ar|ame)\s+(los\s+)?archivos|mi\s+carpeta|contenido\s+de\s+(la\s+)?carpeta|qu[eé]\s+tengo\s+en\s+(drive|archivos|sistemas|mi\s+carpeta))\b/i
const EMAIL_PREP_RE =
  /\b(envi[aá](r|me|le|ale|ame)?|mand[aá](r|me|le|ale|ame)?|correos?|mails?|e-?mails?|prepar[aá]me)\b/i
/** Imperativo / creación — no matchea el sustantivo "agenda". Lookahead evita falsos negativos con acentos (JS \\b). */
const CALENDAR_CREATE_RE =
  /(?:^|[^\p{L}])(?:agend(?:ar|ame|emos|á(?:me)?|ale)|prepar(?:a|á|ar|ame|áme)\s+(?:un\s+)?(?:evento|reuni[oó]n)|cre(?:a|á|ar|ame|áme)\s+(?:un\s+)?(?:evento|reuni[oó]n)|program(?:a|á|ar|ame|áme)\s+(?:un\s+)?(?:evento|reuni[oó]n)|invit(?:a|á|ar|ame|áme|ale))(?=[^\p{L}]|$)/iu
/** Consulta de solo lectura sobre calendario / compromisos. */
const CALENDAR_READ_RE =
  /\b(?:cu[aá]l\s+es\s+mi\s+agenda|mi\s+agenda(?:\s+(?:de\s+la\s+)?(?:semana|hoy|ma[nñ]ana))?|mostr(?:a|á|ame)\s+(?:mi\s+)?agenda|(?:qu[eé]\s+tengo|qu[eé]\s+hay|tengo\s+algo)\s+agendado|qu[eé]\s+tengo\s+(?:en\s+(?:el\s+)?calendario\s+)?(?:hoy|ma[nñ]ana|esta\s+semana|el\s+(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo))|(en\s+(?:el\s+)?)?calendario\s+(?:de\s+)?(?:hoy|ma[nñ]ana|esta\s+semana)|agenda\s+de\s+la\s+semana)\b/i
/** Imperativo cancelar/eliminar — lookahead evita falsos negativos con acentos (JS \\b). */
const CALENDAR_CANCEL_VERB_RE =
  /(?:^|[^\p{L}])(?:cancel[aá](?:r|me|emos|en|á(?:me)?)?|eliminar|borrar|sac[aá](?:r|me|en)?)(?=[^\p{L}]|$)/iu
const CALENDAR_CANCEL_TARGET_RE =
  /(?:reuni[oó]n(?:es)?|evento(?:s)?|cita(?:s)?|compromiso(?:s)?|agenda|calendario)/iu
/** "Cancelá todo", "eliminar todos", etc. — típico tras listar la agenda. */
const CALENDAR_CANCEL_ALL_RE =
  /(?:^|[^\p{L}])(?:todo|todos|todas)(?=[^\p{L}]|$)/iu
const GMAIL_INBOX_TODAY_RE =
  /\b(qu[eé]\s+correos?\s+(tengo|recib[ií]|llegaron)|correos?\s+(de\s+)?hoy|mails?\s+(de\s+)?hoy|bandeja\s+(de\s+entrada\s+)?(de\s+)?hoy|inbox\s+(de\s+)?hoy)\b/i
const EMAIL_BODY_FROM_HISTORY_RE =
  /\b(respuesta\s+anterior|mensaje\s+anterior|lo\s+de\s+rec[ií]en|tu\s+(respuesta|mensaje)\s+(anterior|previo)|cuerpo\s+el\s+resumen\s+de\s+tu|contenido\s+de\s+tu\s+(respuesta|mensaje))/i
const EXPLICIT_DOCUMENT_SUMMARIZE_RE =
  /\b(resum(e|ir|o|ame|á|ar)\s+(los|todos|mis|estos|todas?|\d+\s*(pdf|archivos?|documentos?)))/i

export type SummarizeIntent = {
  limit: number | null
  fileKinds: Array<'PDF' | 'Word' | 'Texto' | 'Documento Google'>
  includeAllSummarizeable: boolean
}

export type QuestionIntent = {
  wantsSummarize: boolean
  wantsListFiles: boolean
  wantsEmail: boolean
  /** Crear evento / borrador (extractActionPlan, prepare_calendar_event). */
  wantsCalendar: boolean
  /** Consultar agenda existente (list_calendar_events). */
  wantsCalendarRead: boolean
  /** Cancelar/eliminar eventos existentes (calendar_cancel). */
  wantsCalendarCancel: boolean
  wantsEmailFromHistory: boolean
  wantsGmailInboxToday: boolean
  summarize: SummarizeIntent | null
}

const SUMMARIZEABLE_KINDS = new Set(['PDF', 'Word', 'Texto', 'Documento Google'])
const EXCLUDED_KINDS = new Set(['Comprimido', 'Imagen', 'Video', 'Audio', 'Otro'])

export function isSummarizeableKind(fileKind: string): boolean {
  return SUMMARIZEABLE_KINDS.has(fileKind) && !EXCLUDED_KINDS.has(fileKind)
}

export function isCalendarReadQuery(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  if (CALENDAR_CREATE_RE.test(normalized)) return false
  return CALENDAR_READ_RE.test(normalized)
}

export function isCalendarCreateQuery(text: string): boolean {
  return CALENDAR_CREATE_RE.test(text.trim())
}

export function isCalendarCancelQuery(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  if (CALENDAR_CREATE_RE.test(normalized)) return false
  if (!CALENDAR_CANCEL_VERB_RE.test(normalized)) return false
  return CALENDAR_CANCEL_TARGET_RE.test(normalized) || CALENDAR_CANCEL_ALL_RE.test(normalized)
}

export function isCalendarCancelAllQuery(text: string): boolean {
  const normalized = text.trim()
  return isCalendarCancelQuery(normalized) && CALENDAR_CANCEL_ALL_RE.test(normalized)
}

/** Rango para cancelación masiva: reutiliza la última consulta de agenda del hilo. */
export function inferCalendarCancelRange(
  question: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  referenceDate = todayInTimeZone(),
): CalendarReadRange {
  const fromQuestion = parseCalendarReadRange(question, referenceDate)
  if (!isCalendarCancelAllQuery(question)) {
    return fromQuestion
  }

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index]
    if (turn.role !== 'user') continue
    if (isCalendarReadQuery(turn.content)) {
      return parseCalendarReadRange(turn.content, referenceDate)
    }
  }

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index]
    if (turn.role === 'assistant' && /Ten[eé]s\s+\*\*\d+\*\*\s+evento\(s\)\s+en\s+tu\s+agenda/i.test(turn.content)) {
      for (let prev = index - 1; prev >= 0; prev -= 1) {
        if (history[prev].role === 'user') {
          return parseCalendarReadRange(history[prev].content, referenceDate)
        }
      }
      break
    }
  }

  return fromQuestion
}

export function analyzeQuestionIntent(question: string): QuestionIntent {
  const text = question.trim()
  const wantsCalendar = CALENDAR_CREATE_RE.test(text)
  const wantsCalendarCancel = !wantsCalendar && isCalendarCancelQuery(text)
  const wantsCalendarRead = !wantsCalendar && !wantsCalendarCancel && CALENDAR_READ_RE.test(text)
  const wantsEmail = EMAIL_PREP_RE.test(text)
  const wantsEmailFromHistory =
    wantsEmail &&
    EMAIL_BODY_FROM_HISTORY_RE.test(text) &&
    !EXPLICIT_DOCUMENT_SUMMARIZE_RE.test(text)
  const wantsGmailInboxToday =
    GMAIL_INBOX_TODAY_RE.test(text) && !wantsCalendarRead && !wantsCalendar
  const wantsSummarize =
    SUMMARIZE_RE.test(text) && !wantsEmailFromHistory
  const wantsListFiles = LIST_FILES_RE.test(text)

  let summarize: SummarizeIntent | null = null
  if (wantsSummarize) {
    const countMatch = COUNT_RE.exec(text)
    const limit = countMatch ? Number.parseInt(countMatch[1], 10) : null
    const fileKinds: SummarizeIntent['fileKinds'] = []
    if (PDF_RE.test(text)) fileKinds.push('PDF')
    if (WORD_RE.test(text)) fileKinds.push('Word')
    if (fileKinds.length === 0) {
      fileKinds.push('PDF', 'Word', 'Texto', 'Documento Google')
    }
    summarize = {
      limit: limit && Number.isFinite(limit) ? limit : null,
      fileKinds,
      includeAllSummarizeable: ALL_FILES_RE.test(text) || (!limit && fileKinds.length > 0),
    }
  }

  return {
    wantsSummarize,
    wantsListFiles,
    wantsEmail,
    wantsCalendar,
    wantsCalendarRead,
    wantsCalendarCancel,
    wantsEmailFromHistory,
    wantsGmailInboxToday,
    summarize,
  }
}

export { parseCalendarReadRange }

export function historyHasRecentSummaries(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): boolean {
  const recentAssistant = [...history]
    .reverse()
    .filter((turn) => turn.role === 'assistant')
    .slice(0, 2)
  return recentAssistant.some(
    (turn) =>
      turn.content.length > 400 &&
      (/\bac[aá]\s+van\s+los\s+res[uú]menes\b/i.test(turn.content) ||
        (turn.content.includes('**') &&
          (turn.content.toLowerCase().includes('pdf') ||
            turn.content.toLowerCase().includes('word')))),
  )
}

export function userFrustratedWithClarification(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): boolean {
  const lastUser = [...history].reverse().find((turn) => turn.role === 'user')
  if (!lastUser) return false
  return /\blo\s+ten[eé]s\s+que\s+saber\b|\bya\s+te\s+(dije|list)/i.test(lastUser.content)
}

export function buildOrchestratorHint(input: {
  intent: QuestionIntent
  summarizedFiles: string[]
  skippedCount: number
  reuseFromHistory?: boolean
}): string {
  const lines = [
    '[Contexto interno — no repetir al usuario como cita técnica]',
  ]
  if (input.reuseFromHistory) {
    lines.push(
      'Los resúmenes ya están en tu mensaje anterior de esta conversación. Reutilizalos directamente.',
    )
  } else {
    lines.push(
      'Los siguientes resúmenes ya fueron generados server-side. Usalos directamente.',
    )
  }
  lines.push(
    'NO vuelvas a preguntar qué archivos resumir.',
    'NO uses search_document_content para resumir documentos completos.',
  )
  if (input.summarizedFiles.length > 0) {
    lines.push(`Archivos resumidos: ${input.summarizedFiles.join(', ')}`)
  }
  if (input.skippedCount > 0) {
    lines.push(
      `Quedaron ${input.skippedCount} archivo(s) sin resumir en este turno por límite de tiempo. Mencioná que se pueden pedir en otro mensaje.`,
    )
  }
  if (input.intent.wantsEmail || input.intent.wantsCalendar) {
    lines.push(
      'Avanzá con prepare_email_draft y/o prepare_calendar_event usando estos resúmenes. No pidas confirmación sobre qué archivos incluir.',
    )
  }
  lines.push(
    'Si el usuario pidió mail o calendario en el mismo mensaje, completá esas acciones ahora con criterio razonable (PDF y Word, excluyendo comprimidos/imágenes/ejecutables).',
  )
  return lines.join('\n')
}
