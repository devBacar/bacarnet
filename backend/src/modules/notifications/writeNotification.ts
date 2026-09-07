import { createHash } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import type { PlannedNotification } from './types.js'

function notificationDocId(dedupeKey: string): string {
  return createHash('sha256').update(dedupeKey).digest('hex').slice(0, 40)
}

export async function writeNotification(plan: PlannedNotification): Promise<void> {
  const docId = notificationDocId(plan.dedupeKey)
  const ref = adminDb()
    .collection('users')
    .doc(plan.recipientUid)
    .collection('notifications')
    .doc(docId)

  const existing = await ref.get()
  if (existing.exists) return

  await ref.set({
    type: plan.type,
    category: plan.category,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    actor: plan.actor,
    title: plan.title,
    body: plan.body,
    deepLink: plan.deepLink,
    context: plan.context,
    dedupeKey: plan.dedupeKey,
  })
}

export async function writeNotifications(plans: PlannedNotification[]): Promise<void> {
  for (const plan of plans) {
    await writeNotification(plan)
  }
}

export async function writeNotificationsBestEffort(plans: PlannedNotification[]): Promise<void> {
  for (const plan of plans) {
    try {
      await writeNotification(plan)
    } catch (err) {
      logError(`notifications: falló escritura para ${plan.recipientUid}`, err)
    }
  }
}
