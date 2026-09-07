import type { AuthedUser } from '../auth/middleware.js'
import { resolveAreaName } from './buildContent.js'
import { excludeActor, resolveAreaChiefs, resolveSuperAdminUids } from './resolveRecipients.js'
import {
  ACTIONABLE_NOTIFICATION_TYPES,
  PASSIVE_NOTIFICATION_TYPES,
  type NotificationActor,
  type PlannedNotification,
} from './types.js'
import { writeNotificationsBestEffort } from './writeNotification.js'
import type { AccessRequestRecord } from '../approvalRequests/types.js'

function actorFromUser(user: Pick<AuthedUser, 'uid' | 'email' | 'displayName'>): NotificationActor {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName?.trim() || null,
  }
}

function requesterLabel(request: AccessRequestRecord): string {
  return request.requesterDisplayName?.trim() || request.requesterEmail
}

function roleLabel(role: AccessRequestRecord['role']): string {
  if (role === 'writer') return 'edición'
  if (role === 'commenter') return 'comentario'
  return 'lectura'
}

function buildAccessRequestActionable(
  recipientUid: string,
  request: AccessRequestRecord & { id: string },
  actor: NotificationActor,
  areaName: string | null,
): PlannedNotification {
  const requesterText = requesterLabel(request)
  return {
    recipientUid,
    type: ACTIONABLE_NOTIFICATION_TYPES.ACCESS_REQUEST,
    category: 'actionable',
    actor,
    title: 'Solicitud de permisos',
    body: `${requesterText} solicita acceso de ${roleLabel(request.role)} a «${request.fileName}»${areaName ? ` (${areaName})` : ''}.`,
    deepLink: { path: `/recursos/documento/${request.fileId}` },
    context: {
      requestId: request.id,
      fileId: request.fileId,
      fileName: request.fileName,
      requestedRole: request.role,
      areaId: request.governingAreaId,
      areaName,
      requestReason: request.reason,
    },
    dedupeKey: [
      ACTIONABLE_NOTIFICATION_TYPES.ACCESS_REQUEST,
      request.id,
      recipientUid,
    ].join(':'),
  }
}

function buildAccessRequestApproved(
  request: AccessRequestRecord & { id: string },
  approver: NotificationActor,
): PlannedNotification {
  return {
    recipientUid: request.requesterUid,
    type: PASSIVE_NOTIFICATION_TYPES.ACCESS_REQUEST_APPROVED,
    category: 'passive',
    actor: approver,
    title: 'Acceso aprobado',
    body: `${approver.displayName?.trim() || approver.email} aprobó tu solicitud de acceso a «${request.fileName}».`,
    deepLink: { path: `/recursos/documento/${request.fileId}` },
    context: {
      requestId: request.id,
      fileId: request.fileId,
      fileName: request.fileName,
      areaId: request.governingAreaId,
      areaName: request.governingAreaName,
    },
    dedupeKey: [
      PASSIVE_NOTIFICATION_TYPES.ACCESS_REQUEST_APPROVED,
      request.id,
      request.requesterUid,
    ].join(':'),
  }
}

function buildAccessRequestRejected(
  request: AccessRequestRecord & { id: string },
  rejector: NotificationActor,
): PlannedNotification {
  return {
    recipientUid: request.requesterUid,
    type: PASSIVE_NOTIFICATION_TYPES.ACCESS_REQUEST_REJECTED,
    category: 'passive',
    actor: rejector,
    title: 'Acceso rechazado',
    body: `${rejector.displayName?.trim() || rejector.email} rechazó tu solicitud de acceso a «${request.fileName}».`,
    deepLink: { path: `/recursos/documento/${request.fileId}` },
    context: {
      requestId: request.id,
      fileId: request.fileId,
      fileName: request.fileName,
      areaId: request.governingAreaId,
      areaName: request.governingAreaName,
    },
    dedupeKey: [
      PASSIVE_NOTIFICATION_TYPES.ACCESS_REQUEST_REJECTED,
      request.id,
      request.requesterUid,
    ].join(':'),
  }
}

export async function emitAccessRequestCreated(
  request: AccessRequestRecord & { id: string },
  actor: AuthedUser,
): Promise<void> {
  const actorPayload = actorFromUser(actor)
  const areaName =
    request.governingAreaName ??
    (request.governingAreaId ? await resolveAreaName(request.governingAreaId) : null)

  let recipientUids: string[] = []
  if (request.governingAreaId) {
    recipientUids = excludeActor(await resolveAreaChiefs(request.governingAreaId), actor.uid).map(
      (member) => member.uid,
    )
  }
  if (recipientUids.length === 0) {
    recipientUids = (await resolveSuperAdminUids()).filter((uid) => uid !== actor.uid)
  }

  recipientUids = [...new Set(recipientUids)]

  const plans = recipientUids.map((recipientUid) =>
    buildAccessRequestActionable(recipientUid, request, actorPayload, areaName),
  )

  await writeNotificationsBestEffort(plans)
}

export async function emitAccessRequestApproved(
  request: AccessRequestRecord & { id: string },
  approver: AuthedUser,
): Promise<void> {
  await writeNotificationsBestEffort([
    buildAccessRequestApproved(request, actorFromUser(approver)),
  ])
}

export async function emitAccessRequestRejected(
  request: AccessRequestRecord & { id: string },
  rejector: AuthedUser,
): Promise<void> {
  await writeNotificationsBestEffort([
    buildAccessRequestRejected(request, actorFromUser(rejector)),
  ])
}

export async function emitAccessRequestCreatedBestEffort(
  request: AccessRequestRecord & { id: string },
  actor: AuthedUser,
): Promise<void> {
  try {
    await emitAccessRequestCreated(request, actor)
  } catch {
    // best effort
  }
}
