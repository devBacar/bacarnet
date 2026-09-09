import type { Request, Response } from 'express'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import { isSuperAdminUser } from '../auth/middleware.js'
import { ASSISTANT_INTERACTIONS_COLLECTION } from './constants.js'

const DEFAULT_LIMIT = 40
const MAX_LIMIT = 100

const VALID_CATEGORIES = [
  'resolved',
  'could_not_answer',
  'broken',
  'pending_dev_review',
] as const

type ListCategory = (typeof VALID_CATEGORIES)[number]

function serializeTimestamp(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  return null
}

export async function listAssistantInteractions(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user || !isSuperAdminUser(user)) {
    res.status(403).json({ error: 'Se requiere rol super_admin' })
    return
  }

  const categoryRaw = typeof req.query.category === 'string' ? req.query.category.trim() : ''
  if (!VALID_CATEGORIES.includes(categoryRaw as ListCategory)) {
    res.status(400).json({
      error:
        'Parámetro category inválido. Usá resolved, could_not_answer, broken o pending_dev_review.',
    })
    return
  }

  const limitRaw = Number(req.query.limit)
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(MAX_LIMIT, Math.floor(limitRaw))
      : DEFAULT_LIMIT

  try {
    let snap
    if (categoryRaw === 'pending_dev_review') {
      try {
        snap = await adminDb()
          .collection(ASSISTANT_INTERACTIONS_COLLECTION)
          .where('devReviewStatus', '==', 'pending')
          .orderBy('createdAt', 'desc')
          .limit(limit)
          .get()
      } catch (queryErr) {
        const message = queryErr instanceof Error ? queryErr.message : String(queryErr)
        if (!message.includes('index') && !message.includes('FAILED_PRECONDITION')) {
          throw queryErr
        }
        const fallback = await adminDb()
          .collection(ASSISTANT_INTERACTIONS_COLLECTION)
          .orderBy('createdAt', 'desc')
          .limit(Math.min(400, limit * 6))
          .get()
        snap = {
          docs: fallback.docs
            .filter((doc) => doc.data().devReviewStatus === 'pending')
            .slice(0, limit),
        } as typeof fallback
      }
    } else {
      try {
        snap = await adminDb()
          .collection(ASSISTANT_INTERACTIONS_COLLECTION)
          .where('category', '==', categoryRaw)
          .orderBy('createdAt', 'desc')
          .limit(limit)
          .get()
      } catch (queryErr) {
        const message = queryErr instanceof Error ? queryErr.message : String(queryErr)
        if (!message.includes('index') && !message.includes('FAILED_PRECONDITION')) {
          throw queryErr
        }
        const fallback = await adminDb()
          .collection(ASSISTANT_INTERACTIONS_COLLECTION)
          .orderBy('createdAt', 'desc')
          .limit(Math.min(200, limit * 4))
          .get()
        snap = {
          docs: fallback.docs.filter((doc) => doc.data().category === categoryRaw).slice(0, limit),
        } as typeof fallback
      }
    }

    const interactions = snap.docs
      .map((doc) => {
        const data = doc.data()
        const userFeedback = data.userFeedback === 'up' || data.userFeedback === 'down'
          ? data.userFeedback
          : null
        const storedCategory =
          data.category === 'resolved' ||
          data.category === 'could_not_answer' ||
          data.category === 'broken'
            ? data.category
            : 'could_not_answer'

        return {
          id: doc.id,
          userId: typeof data.userId === 'string' ? data.userId : '',
          userEmail: typeof data.userEmail === 'string' ? data.userEmail : '',
          question: typeof data.question === 'string' ? data.question : '',
          answer: typeof data.answer === 'string' ? data.answer : '',
          toolsUsed: Array.isArray(data.toolsUsed)
            ? data.toolsUsed.filter((item): item is string => typeof item === 'string')
            : [],
          category: categoryRaw === 'pending_dev_review' ? storedCategory : categoryRaw,
          latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : 0,
          createdAt: serializeTimestamp(data.createdAt),
          userFeedback,
          userReported: data.userReported === true,
          userFeedbackAt: serializeTimestamp(data.userFeedbackAt),
          devReviewStatus:
            data.devReviewStatus === 'pending' || data.devReviewStatus === 'done'
              ? data.devReviewStatus
              : null,
          devReviewNote: typeof data.devReviewNote === 'string' ? data.devReviewNote : null,
          devReviewMarkedAt: serializeTimestamp(data.devReviewMarkedAt),
          devReviewMarkedBy:
            typeof data.devReviewMarkedBy === 'string' ? data.devReviewMarkedBy : null,
          devReviewResolvedAt: serializeTimestamp(data.devReviewResolvedAt),
          devReviewResolvedBy:
            typeof data.devReviewResolvedBy === 'string' ? data.devReviewResolvedBy : null,
        }
      })
      .sort((a, b) => {
        if (a.userReported !== b.userReported) return a.userReported ? -1 : 1
        return 0
      })

    res.json({ interactions, category: categoryRaw, count: interactions.length })
  } catch (err) {
    logError('listAssistantInteractions falló', err)
    res.status(500).json({ error: 'No se pudieron listar las interacciones' })
  }
}
