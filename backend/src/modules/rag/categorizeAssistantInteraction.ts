export type AssistantInteractionCategory = 'resolved' | 'could_not_answer' | 'broken'

const BROKEN_ANSWER_RE =
  /^(no pude generar una respuesta|algo sali[oó] mal al procesar|algo sali[oó] mal al armar|algo sali[oó] mal en el servidor)/i

const LIMITATION_RE =
  /\b(no puedo|no podemos|no tengo|no est[aá] habilitad|limitaci[oó]n|gmail\.readonly|bandeja de entrada|leer (?:los |la )?(?:mails|correos) recibidos|leer tu bandeja|scope|fuera de (?:mi|tu) alcance|no disponible para|todav[ií]a no (?:est[aá]|puedo)|no tengo acceso a)\b/i

const SUBSTANTIVE_ANSWER_MIN = 40

export function categorizeAssistantInteraction(input: {
  question: string
  answer: string
  toolsUsed: string[]
  technicalError?: boolean
  httpStatus?: number
}): AssistantInteractionCategory {
  if (input.technicalError === true) return 'broken'
  if (input.httpStatus !== undefined && input.httpStatus >= 500) return 'broken'

  const answer = input.answer.trim()
  if (!answer || BROKEN_ANSWER_RE.test(answer)) return 'broken'

  if (LIMITATION_RE.test(answer)) return 'could_not_answer'

  const hasTools = input.toolsUsed.length > 0
  if (answer.length >= SUBSTANTIVE_ANSWER_MIN || hasTools) return 'resolved'

  if (LIMITATION_RE.test(input.question)) return 'could_not_answer'

  return answer.length >= 20 ? 'resolved' : 'could_not_answer'
}
