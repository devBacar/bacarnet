import { FieldValue } from 'firebase-admin/firestore'
import type { Request, Response } from 'express'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import { isSuperAdminUser } from '../auth/middleware.js'
import type { AssistantUsageMeter } from './assistantUsageMeter.js'
import { embedTexts } from './embeddings.js'
import { cosineSimilarity } from './cosineSimilarity.js'
import {
  ASSISTANT_CORRECTIONS_COLLECTION,
  ASSISTANT_CORRECTION_MAX_MATCHES,
  ASSISTANT_CORRECTION_SIMILARITY_THRESHOLD,
} from './constants.js'

export type AssistantCorrectionMatch = {
  originalQuestion: string
  correctionText: string
  score: number
}

type StoredCorrection = {
  originalQuestion: string
  correctionText: string
  questionEmbedding: number[]
}

let correctionsCache: { loadedAt: number; items: Array<StoredCorrection & { id: string }> } | null =
  null
const CACHE_TTL_MS = 60_000

async function loadAllCorrections(): Promise<Array<StoredCorrection & { id: string }>> {
  const now = Date.now()
  if (correctionsCache && now - correctionsCache.loadedAt < CACHE_TTL_MS) {
    return correctionsCache.items
  }

  const snap = await adminDb().collection(ASSISTANT_CORRECTIONS_COLLECTION).limit(200).get()

  const items = snap.docs
    .map((doc) => {
      const data = doc.data()
      const embedding = Array.isArray(data.questionEmbedding)
        ? data.questionEmbedding.filter((value): value is number => typeof value === 'number')
        : []
      if (
        typeof data.originalQuestion !== 'string' ||
        typeof data.correctionText !== 'string' ||
        embedding.length === 0
      ) {
        return null
      }
      return {
        id: doc.id,
        originalQuestion: data.originalQuestion,
        correctionText: data.correctionText,
        questionEmbedding: embedding,
      }
    })
    .filter((item): item is StoredCorrection & { id: string } => item !== null)

  correctionsCache = { loadedAt: now, items }
  return items
}

export function invalidateCorrectionsCache(): void {
  correctionsCache = null
}

export async function loadRelevantCorrections(
  question: string,
  usageMeter?: AssistantUsageMeter,
): Promise<AssistantCorrectionMatch[]> {
  const trimmed = question.trim()
  if (trimmed.length < 4) return []

  const stored = await loadAllCorrections()
  if (stored.length === 0) return []

  const [queryVector] = await embedTexts([trimmed], usageMeter)
  return stored
    .map((item) => ({
      originalQuestion: item.originalQuestion,
      correctionText: item.correctionText,
      score: cosineSimilarity(queryVector, item.questionEmbedding),
    }))
    .filter((item) => item.score >= ASSISTANT_CORRECTION_SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, ASSISTANT_CORRECTION_MAX_MATCHES)
}

export function formatCorrectionsForSystemInstruction(
  corrections: Array<{ originalQuestion: string; correctionText: string }>,
): string {
  if (corrections.length === 0) return ''

  const blocks = corrections.map(
    (item, index) =>
      `${index + 1}) Pregunta similar: "${item.originalQuestion}"\n   Guía de respuesta correcta: ${item.correctionText}`,
  )

  return (
    'Correcciones acumuladas del equipo (priorizalas si la consulta actual es similar):\n' +
    blocks.join('\n') +
    '\nAplicá estas guías sin mencionar que provienen de correcciones internas.'
  )
}

export async function createAssistantCorrection(input: {
  sourceInteractionId?: string
  originalQuestion: string
  correctionText: string
  createdByUserId: string
  createdByEmail: string
}): Promise<{ id: string }> {
  const originalQuestion = input.originalQuestion.trim()
  const correctionText = input.correctionText.trim()
  if (originalQuestion.length < 4) {
    throw new Error('La pregunta original es demasiado corta.')
  }
  if (correctionText.length < 8) {
    throw new Error('La corrección debe tener al menos 8 caracteres.')
  }

  const [questionEmbedding] = await embedTexts([originalQuestion])

  const doc = {
    sourceInteractionId: input.sourceInteractionId?.trim() || null,
    originalQuestion: originalQuestion.slice(0, 4000),
    correctionText: correctionText.slice(0, 8000),
    questionEmbedding,
    createdByUserId: input.createdByUserId,
    createdByEmail: input.createdByEmail,
    createdAt: FieldValue.serverTimestamp(),
  }

  const ref = await adminDb().collection(ASSISTANT_CORRECTIONS_COLLECTION).add(doc)
  invalidateCorrectionsCache()
  return { id: ref.id }
}

export async function createAssistantCorrectionHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const user = req.authedUser
  if (!user || !isSuperAdminUser(user)) {
    res.status(403).json({ error: 'Se requiere rol super_admin' })
    return
  }

  const body = req.body as Record<string, unknown> | null
  const originalQuestion =
    typeof body?.originalQuestion === 'string' ? body.originalQuestion.trim() : ''
  const correctionText =
    typeof body?.correctionText === 'string' ? body.correctionText.trim() : ''
  const sourceInteractionId =
    typeof body?.interactionId === 'string' ? body.interactionId.trim() : undefined

  try {
    const created = await createAssistantCorrection({
      sourceInteractionId,
      originalQuestion,
      correctionText,
      createdByUserId: user.uid,
      createdByEmail: user.email,
    })
    res.status(201).json({ ok: true, correctionId: created.id })
  } catch (err) {
    logError('createAssistantCorrection falló', err)
    res.status(400).json({
      error: err instanceof Error ? err.message : 'No se pudo guardar la corrección',
    })
  }
}
