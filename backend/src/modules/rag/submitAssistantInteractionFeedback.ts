import { FieldValue } from 'firebase-admin/firestore'
import type { Request, Response } from 'express'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import { ASSISTANT_INTERACTIONS_COLLECTION } from './constants.js'

type UserFeedback = 'up' | 'down'

function parseFeedback(value: unknown): UserFeedback | null {
  return value === 'up' || value === 'down' ? value : null
}

export async function submitAssistantInteractionFeedback(
  req: Request,
  res: Response,
): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const interactionId =
    typeof req.params.interactionId === 'string' ? req.params.interactionId.trim() : ''
  if (!interactionId) {
    res.status(400).json({ error: 'interactionId inválido' })
    return
  }

  const body = req.body as Record<string, unknown> | null
  const feedback = parseFeedback(body?.feedback)
  if (!feedback) {
    res.status(400).json({ error: 'feedback inválido. Usá up o down.' })
    return
  }

  try {
    const ref = adminDb().collection(ASSISTANT_INTERACTIONS_COLLECTION).doc(interactionId)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: 'Interacción no encontrada' })
      return
    }

    const ownerId = snap.get('userId')
    if (typeof ownerId !== 'string' || ownerId !== user.uid) {
      res.status(403).json({ error: 'No podés calificar esta interacción' })
      return
    }

    await ref.update({
      userFeedback: feedback,
      userFeedbackAt: FieldValue.serverTimestamp(),
      ...(feedback === 'down' ? { userReported: true } : {}),
    })

    res.json({
      ok: true,
      interactionId,
      feedback,
      userReported: feedback === 'down',
    })
  } catch (err) {
    logError('submitAssistantInteractionFeedback falló', err)
    res.status(500).json({ error: 'No se pudo registrar el feedback' })
  }
}
