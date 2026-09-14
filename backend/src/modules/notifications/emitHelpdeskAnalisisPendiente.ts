import type { AuthedUser } from '../auth/middleware.js'
import { resolveUidByEmail } from './resolveRecipients.js'
import { ACTIONABLE_NOTIFICATION_TYPES, type NotificationActor, type PlannedNotification } from './types.js'
import { writeNotificationsBestEffort } from './writeNotification.js'

function actorFromUser(user: Pick<AuthedUser, 'uid' | 'email' | 'displayName'>): NotificationActor {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName?.trim() || null,
  }
}

function buildNotification(
  recipientUid: string,
  input: {
    ticketId: string
    analisisId: string
    areaNombre: string
    actor: NotificationActor
  },
): PlannedNotification {
  return {
    recipientUid,
    type: ACTIONABLE_NOTIFICATION_TYPES.HELPDESK_ANALISIS_PENDIENTE,
    category: 'actionable',
    actor: input.actor,
    title: 'Análisis pendiente de aprobación',
    body: `Hay un análisis del proyecto «${input.areaNombre}» esperando tu revisión.`,
    deepLink: { path: '/aprobaciones-pendientes' },
    context: {
      ticketId: input.ticketId,
      analisisId: input.analisisId,
      areaName: input.areaNombre,
    },
    dedupeKey: [
      ACTIONABLE_NOTIFICATION_TYPES.HELPDESK_ANALISIS_PENDIENTE,
      input.ticketId,
      input.analisisId,
      recipientUid,
    ].join(':'),
  }
}

/** Notificación in-app para cada aprobador (best effort; no bloquea el upload). */
export async function emitHelpdeskAnalisisPendienteNotifications(input: {
  ticketId: string
  analisisId: string
  areaNombre: string
  aprobadoresEmails: string[]
  actor: AuthedUser
}): Promise<void> {
  const actor = actorFromUser(input.actor)
  const planned: PlannedNotification[] = []

  for (const email of input.aprobadoresEmails) {
    const uid = await resolveUidByEmail(email)
    if (!uid) continue
    planned.push(
      buildNotification(uid, {
        ticketId: input.ticketId,
        analisisId: input.analisisId,
        areaNombre: input.areaNombre,
        actor,
      }),
    )
  }

  if (planned.length === 0) return
  void writeNotificationsBestEffort(planned)
}
