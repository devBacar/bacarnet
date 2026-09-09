import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import {
  categorizeAssistantInteraction,
  type AssistantInteractionCategory,
} from './categorizeAssistantInteraction.js'
import type { AssistantInteractionUsage } from './assistantUsageMeter.js'
import { ASSISTANT_INTERACTIONS_COLLECTION } from './constants.js'

export type AssistantInteractionRecord = {
  userId: string
  userEmail: string
  question: string
  answer: string
  toolsUsed: string[]
  category: AssistantInteractionCategory
  latencyMs: number
  httpStatus?: number
  errorCode?: string
  userFeedback?: 'up' | 'down'
  userReported?: boolean
  userFeedbackAt?: ReturnType<typeof FieldValue.serverTimestamp>
  usage?: AssistantInteractionUsage
  createdAt: ReturnType<typeof FieldValue.serverTimestamp>
}

export async function writeAssistantInteractionBestEffort(input: {
  userId: string
  userEmail: string
  question: string
  answer: string
  toolsUsed: string[]
  latencyMs: number
  technicalError?: boolean
  httpStatus?: number
  errorCode?: string
  usage?: AssistantInteractionUsage
}): Promise<string | null> {
  try {
    const category = categorizeAssistantInteraction({
      question: input.question,
      answer: input.answer,
      toolsUsed: input.toolsUsed,
      technicalError: input.technicalError,
      httpStatus: input.httpStatus,
    })

    const doc: AssistantInteractionRecord = {
      userId: input.userId,
      userEmail: input.userEmail,
      question: input.question.slice(0, 4000),
      answer: input.answer.slice(0, 12000),
      toolsUsed: input.toolsUsed.slice(0, 32),
      category,
      latencyMs: input.latencyMs,
      createdAt: FieldValue.serverTimestamp(),
    }
    if (input.httpStatus !== undefined) doc.httpStatus = input.httpStatus
    if (input.errorCode) doc.errorCode = input.errorCode.slice(0, 120)
    if (input.usage) doc.usage = input.usage

    const ref = await adminDb().collection(ASSISTANT_INTERACTIONS_COLLECTION).add(doc)
    return ref.id
  } catch (err) {
    logError('No se pudo registrar assistantInteraction', err)
    return null
  }
}
