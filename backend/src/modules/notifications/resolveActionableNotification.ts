import { createHash } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import {
  ACTIONABLE_NOTIFICATION_TYPES,
  type ActionableNotificationType,
} from './types.js'

function notificationDocId(dedupeKey: string): string {
  return createHash('sha256').update(dedupeKey).digest('hex').slice(0, 40)
}

function buildDedupeKey(
  type: ActionableNotificationType,
  requestId: string,
  recipientUid: string,
): string {
  return [type, requestId, recipientUid].join(':')
}

function resolvedBody(
  type: ActionableNotificationType,
  status: 'approved' | 'rejected',
  fileName: string | null,
): string {
  const docLabel = fileName ? `«${fileName}»` : 'este documento'
  if (status === 'approved') {
    return type === ACTIONABLE_NOTIFICATION_TYPES.OFFICE_UPLOAD_REQUEST
      ? `Ya aprobaste la subida de ${docLabel}.`
      : `Ya aprobaste el acceso a ${docLabel}.`
  }
  return type === ACTIONABLE_NOTIFICATION_TYPES.OFFICE_UPLOAD_REQUEST
    ? `Ya rechazaste la subida de ${docLabel}.`
    : `Ya rechazaste el acceso a ${docLabel}.`
}

export async function resolveActionableNotificationBestEffort(input: {
  recipientUid: string
  requestId: string
  type: ActionableNotificationType
  status: 'approved' | 'rejected'
  fileName?: string | null
}): Promise<void> {
  try {
    const dedupeKey = buildDedupeKey(input.type, input.requestId, input.recipientUid)
    const docId = notificationDocId(dedupeKey)
    const ref = adminDb()
      .collection('users')
      .doc(input.recipientUid)
      .collection('notifications')
      .doc(docId)

    const snap = await ref.get()
    if (!snap.exists) return

    const fileName =
      typeof input.fileName === 'string'
        ? input.fileName
        : typeof snap.get('context.fileName') === 'string'
          ? (snap.get('context.fileName') as string)
          : null

    await ref.update({
      read: true,
      resolvedAt: FieldValue.serverTimestamp(),
      context: {
        ...(snap.get('context') as Record<string, unknown>),
        requestStatus: input.status,
      },
      body: resolvedBody(input.type, input.status, fileName),
    })
  } catch (err) {
    logError('notifications: falló resolver actionable', err)
  }
}
