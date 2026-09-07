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
import type { OfficeUploadRequestRecord } from '../approvalRequests/types.js'

function actorFromUser(user: Pick<AuthedUser, 'uid' | 'email' | 'displayName'>): NotificationActor {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName?.trim() || null,
  }
}

function requesterLabel(request: OfficeUploadRequestRecord): string {
  return request.requesterDisplayName?.trim() || request.requesterEmail
}

function officeLabel(mimeType: string): string {
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'Excel'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'PowerPoint'
  return 'Word'
}

function buildOfficeUploadActionable(
  recipientUid: string,
  request: OfficeUploadRequestRecord & { id: string },
  actor: NotificationActor,
  areaName: string | null,
): PlannedNotification {
  const requesterText = requesterLabel(request)
  const folderLabel = request.parentFolderName ? ` en «${request.parentFolderName}»` : ''
  return {
    recipientUid,
    type: ACTIONABLE_NOTIFICATION_TYPES.OFFICE_UPLOAD_REQUEST,
    category: 'actionable',
    actor,
    title: 'Solicitud de subida Office',
    body: `${requesterText} solicita subir ${officeLabel(request.mimeType)} «${request.fileName}»${folderLabel}${areaName ? ` (${areaName})` : ''}.`,
    deepLink: { path: '/recursos' },
    context: {
      requestId: request.id,
      fileName: request.fileName,
      mimeType: request.mimeType,
      parentFolderId: request.parentFolderId,
      areaId: request.governingAreaId,
      areaName,
      requestReason: request.reason,
      classification: request.classification,
    },
    dedupeKey: [
      ACTIONABLE_NOTIFICATION_TYPES.OFFICE_UPLOAD_REQUEST,
      request.id,
      recipientUid,
    ].join(':'),
  }
}

function buildOfficeUploadApproved(
  request: OfficeUploadRequestRecord & { id: string },
  approver: NotificationActor,
  fileId: string,
): PlannedNotification {
  return {
    recipientUid: request.requesterUid,
    type: PASSIVE_NOTIFICATION_TYPES.OFFICE_UPLOAD_APPROVED,
    category: 'passive',
    actor: approver,
    title: 'Subida aprobada',
    body: `${approver.displayName?.trim() || approver.email} aprobó tu solicitud para subir «${request.fileName}».`,
    deepLink: { path: `/recursos/documento/${fileId}` },
    context: {
      requestId: request.id,
      fileId,
      fileName: request.fileName,
      areaId: request.governingAreaId,
      areaName: request.governingAreaName,
    },
    dedupeKey: [
      PASSIVE_NOTIFICATION_TYPES.OFFICE_UPLOAD_APPROVED,
      request.id,
      request.requesterUid,
    ].join(':'),
  }
}

function buildOfficeUploadRejected(
  request: OfficeUploadRequestRecord & { id: string },
  rejector: NotificationActor,
): PlannedNotification {
  return {
    recipientUid: request.requesterUid,
    type: PASSIVE_NOTIFICATION_TYPES.OFFICE_UPLOAD_REJECTED,
    category: 'passive',
    actor: rejector,
    title: 'Subida rechazada',
    body: `${rejector.displayName?.trim() || rejector.email} rechazó tu solicitud para subir «${request.fileName}».`,
    deepLink: { path: '/recursos' },
    context: {
      requestId: request.id,
      fileName: request.fileName,
      areaId: request.governingAreaId,
      areaName: request.governingAreaName,
    },
    dedupeKey: [
      PASSIVE_NOTIFICATION_TYPES.OFFICE_UPLOAD_REJECTED,
      request.id,
      request.requesterUid,
    ].join(':'),
  }
}

export async function emitOfficeUploadRequestCreated(
  request: OfficeUploadRequestRecord & { id: string },
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
    buildOfficeUploadActionable(recipientUid, request, actorPayload, areaName),
  )

  await writeNotificationsBestEffort(plans)
}

export async function emitOfficeUploadRequestApproved(
  request: OfficeUploadRequestRecord & { id: string },
  approver: AuthedUser,
  fileId: string,
): Promise<void> {
  await writeNotificationsBestEffort([
    buildOfficeUploadApproved(request, actorFromUser(approver), fileId),
  ])
}

export async function emitOfficeUploadRequestRejected(
  request: OfficeUploadRequestRecord & { id: string },
  rejector: AuthedUser,
): Promise<void> {
  await writeNotificationsBestEffort([
    buildOfficeUploadRejected(request, actorFromUser(rejector)),
  ])
}

export async function emitOfficeUploadRequestCreatedBestEffort(
  request: OfficeUploadRequestRecord & { id: string },
  actor: AuthedUser,
): Promise<void> {
  try {
    await emitOfficeUploadRequestCreated(request, actor)
  } catch {
    // best effort
  }
}
