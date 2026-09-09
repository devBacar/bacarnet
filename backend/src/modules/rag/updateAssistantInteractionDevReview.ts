import type { Request, Response } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import { isSuperAdminUser } from '../auth/middleware.js'
import { ASSISTANT_INTERACTIONS_COLLECTION } from './constants.js'

type DevReviewAction = 'mark_pending' | 'mark_done' | 'clear'

const VALID_ACTIONS: DevReviewAction[] = ['mark_pending', 'mark_done', 'clear']

export async function updateAssistantInteractionDevReview(
  req: Request,
  res: Response,
): Promise<void> {
  const user = req.authedUser
  if (!user || !isSuperAdminUser(user)) {
    res.status(403).json({ error: 'Se requiere rol super_admin' })
    return
  }

  const interactionId =
    typeof req.params.interactionId === 'string' ? req.params.interactionId.trim() : ''
  if (!interactionId) {
    res.status(400).json({ error: 'interactionId requerido' })
    return
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const action = typeof body.action === 'string' ? body.action.trim() : ''
  if (!VALID_ACTIONS.includes(action as DevReviewAction)) {
    res.status(400).json({
      error: 'Acción inválida. Usá mark_pending, mark_done o clear.',
    })
    return
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : ''

  try {
    const ref = adminDb().collection(ASSISTANT_INTERACTIONS_COLLECTION).doc(interactionId)
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: 'Interacción no encontrada' })
      return
    }

    if (action === 'mark_pending') {
      await ref.update({
        devReviewStatus: 'pending',
        devReviewNote: note || null,
        devReviewMarkedAt: FieldValue.serverTimestamp(),
        devReviewMarkedBy: user.email,
        devReviewResolvedAt: FieldValue.delete(),
        devReviewResolvedBy: FieldValue.delete(),
      })
      res.json({ ok: true, interactionId, devReviewStatus: 'pending' })
      return
    }

    if (action === 'mark_done') {
      await ref.update({
        devReviewStatus: 'done',
        devReviewResolvedAt: FieldValue.serverTimestamp(),
        devReviewResolvedBy: user.email,
      })
      res.json({ ok: true, interactionId, devReviewStatus: 'done' })
      return
    }

    await ref.update({
      devReviewStatus: FieldValue.delete(),
      devReviewNote: FieldValue.delete(),
      devReviewMarkedAt: FieldValue.delete(),
      devReviewMarkedBy: FieldValue.delete(),
      devReviewResolvedAt: FieldValue.delete(),
      devReviewResolvedBy: FieldValue.delete(),
    })
    res.json({ ok: true, interactionId, devReviewStatus: null })
  } catch (err) {
    logError('updateAssistantInteractionDevReview falló', err)
    res.status(500).json({ error: 'No se pudo actualizar la revisión de desarrollo' })
  }
}
