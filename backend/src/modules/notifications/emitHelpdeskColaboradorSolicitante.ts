import type { AuthedUser } from '../auth/middleware.js'
import type { HelpdeskColaboradorSolicitanteRol } from '../helpdesk/types.js'
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

function rolLabel(rol: HelpdeskColaboradorSolicitanteRol): string {
  return rol === 'editor' ? 'Editor' : 'Lector'
}

export async function emitHelpdeskColaboradorSolicitanteNotification(input: {
  ticketId: string
  areaNombre: string
  colaboradorEmail: string
  colaboradorUid: string | null
  rol: HelpdeskColaboradorSolicitanteRol
  actor: AuthedUser
}): Promise<void> {
  const recipientUid =
    input.colaboradorUid?.trim() || (await resolveUidByEmail(input.colaboradorEmail))
  if (!recipientUid) return

  const actor = actorFromUser(input.actor)
  const plan: PlannedNotification = {
    recipientUid,
    type: PASSIVE_NOTIFICATION_TYPES.HELPDESK_COLABORADOR_SOLICITANTE,
    category: 'passive',
    actor,
    title: 'Invitación a colaborar en un proyecto',
    body: `Te invitaron a colaborar como ${rolLabel(input.rol)} en «${input.areaNombre}».`,
    deepLink: { path: '/mis-solicitudes-sistemas' },
    context: {
      ticketId: input.ticketId,
      areaName: input.areaNombre,
      colaboradorRol: input.rol,
    },
    dedupeKey: [
      PASSIVE_NOTIFICATION_TYPES.HELPDESK_COLABORADOR_SOLICITANTE,
      input.ticketId,
      recipientUid,
      input.colaboradorEmail.trim().toLowerCase(),
    ].join(':'),
  }

  void writeNotificationsBestEffort([plan])
}
