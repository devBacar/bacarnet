import type { AuthedUser } from '../auth/middleware.js'
import { resolveUidByEmail } from './resolveRecipients.js'
import { PASSIVE_NOTIFICATION_TYPES, type NotificationActor, type PlannedNotification } from './types.js'
import { writeNotificationsBestEffort } from './writeNotification.js'

function actorFromUser(user: Pick<AuthedUser, 'uid' | 'email' | 'displayName'>): NotificationActor {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName?.trim() || null,
  }
}

export async function emitHelpdeskColaboradorSistemasNotification(input: {
  ticketId: string
  areaNombre: string
  teamMemberEmail: string
  actor: AuthedUser
}): Promise<void> {
  const recipientUid = await resolveUidByEmail(input.teamMemberEmail)
  if (!recipientUid) return

  const actor = actorFromUser(input.actor)
  const plan: PlannedNotification = {
    recipientUid,
    type: PASSIVE_NOTIFICATION_TYPES.HELPDESK_COLABORADOR_SISTEMAS,
    category: 'passive',
    actor,
    title: 'Colaborador en proyecto de Sistemas',
    body: `Te sumaron como colaborador en el proyecto «${input.areaNombre}».`,
    deepLink: { path: `/sistemas/mesa-ayuda?ticket=${encodeURIComponent(input.ticketId)}` },
    context: { ticketId: input.ticketId, areaName: input.areaNombre },
    dedupeKey: [
      PASSIVE_NOTIFICATION_TYPES.HELPDESK_COLABORADOR_SISTEMAS,
      input.ticketId,
      recipientUid,
      input.teamMemberEmail.trim().toLowerCase(),
    ].join(':'),
  }

  void writeNotificationsBestEffort([plan])
}
