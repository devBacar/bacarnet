import { logError } from '../../lib/log.js'
import type { AuditLogEntry } from '../audit/writeAuditLog.js'
import { resolveFileGoverningAreaId } from '../drive/governDriveFile.js'
import { buildPlannedNotification, resolveAreaName } from './buildContent.js'
import {
  excludeActor,
  resolveAreaChiefs,
  resolveAreaMembersAndChiefs,
  resolveUidByEmail,
  uniqueMembers,
} from './resolveRecipients.js'
import { PASSIVE_NOTIFICATION_TYPES, type NotificationActor, type PlannedNotification } from './types.js'
import { writeNotificationsBestEffort } from './writeNotification.js'

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function actorFromEntry(entry: AuditLogEntry): NotificationActor {
  return {
    uid: entry.userId,
    email: entry.userEmail,
    displayName: null,
  }
}

async function governingAreaFromEntry(entry: AuditLogEntry): Promise<string | null> {
  const metadata = entry.metadata ?? {}
  const fromMetadata = metadataString(metadata, 'governingAreaId')
  if (fromMetadata) return fromMetadata

  if (entry.targetType === 'file') {
    return resolveFileGoverningAreaId(entry.targetId, entry.parentFolderId)
  }

  const areaFanOut = metadata.areaFanOut
  if (areaFanOut && typeof areaFanOut === 'object' && !Array.isArray(areaFanOut)) {
    const areaId = (areaFanOut as Record<string, unknown>).governingAreaId
    if (typeof areaId === 'string' && areaId.length > 0) return areaId
  }

  return null
}

async function recipientUidFromGrantMetadata(
  metadata: Record<string, unknown>,
): Promise<string | null> {
  const granteeUid = metadataString(metadata, 'granteeUid')
  if (granteeUid) return granteeUid

  const granteeEmail = metadataString(metadata, 'granteeEmail')
  if (!granteeEmail) return null
  return resolveUidByEmail(granteeEmail)
}

function shouldNotifyPermissionChange(metadata: Record<string, unknown>): boolean {
  const shareType = metadataString(metadata, 'type')
  if (shareType && shareType !== 'user') return false
  return Boolean(metadataString(metadata, 'granteeEmail') || metadataString(metadata, 'granteeUid'))
}

export async function planNotificationsFromAudit(entry: AuditLogEntry): Promise<PlannedNotification[]> {
  const actor = actorFromEntry(entry)
  const metadata = entry.metadata ?? {}
  const plans: PlannedNotification[] = []

  switch (entry.action) {
    case 'create': {
      if (entry.targetType !== 'file') break
      const areaId = await governingAreaFromEntry(entry)
      if (!areaId) break
      const areaName = await resolveAreaName(areaId)
      const recipients = excludeActor(await resolveAreaMembersAndChiefs(areaId), actor.uid)
      for (const recipient of recipients) {
        plans.push(
          buildPlannedNotification({
            recipientUid: recipient.uid,
            type: PASSIVE_NOTIFICATION_TYPES.FILE_CREATED_IN_AREA,
            actor,
            entry,
            areaId,
            areaName,
          }),
        )
      }
      break
    }
    case 'permission_grant': {
      if (!shouldNotifyPermissionChange(metadata)) break
      const recipientUid = await recipientUidFromGrantMetadata(metadata)
      if (!recipientUid || recipientUid === actor.uid) break
      plans.push(
        buildPlannedNotification({
          recipientUid,
          type: PASSIVE_NOTIFICATION_TYPES.ACCESS_GRANTED,
          actor,
          entry,
        }),
      )
      break
    }
    case 'permission_revoke': {
      if (!shouldNotifyPermissionChange(metadata)) break
      const recipientUid = await recipientUidFromGrantMetadata(metadata)
      if (!recipientUid || recipientUid === actor.uid) break
      plans.push(
        buildPlannedNotification({
          recipientUid,
          type: PASSIVE_NOTIFICATION_TYPES.ACCESS_REVOKED,
          actor,
          entry,
        }),
      )
      break
    }
    case 'authorized_copy': {
      const areaId = await governingAreaFromEntry(entry)
      if (!areaId) break
      const areaName = await resolveAreaName(areaId)
      const recipients = excludeActor(await resolveAreaChiefs(areaId), actor.uid)
      for (const recipient of recipients) {
        plans.push(
          buildPlannedNotification({
            recipientUid: recipient.uid,
            type: PASSIVE_NOTIFICATION_TYPES.AUTHORIZED_COPY,
            actor,
            entry,
            areaId,
            areaName,
          }),
        )
      }
      break
    }
    case 'managed_areas_change':
    case 'member_areas_change':
    case 'action_grants_change': {
      if (entry.targetType !== 'user') break
      if (entry.targetId === actor.uid) break
      plans.push(
        buildPlannedNotification({
          recipientUid: entry.targetId,
          type: PASSIVE_NOTIFICATION_TYPES.USER_GOVERNANCE_CHANGE,
          actor,
          entry,
        }),
      )
      break
    }
    case 'board_access_grant':
    case 'board_access_revoke': {
      const recipientUid = metadataString(metadata, 'granteeUid')
      if (!recipientUid || recipientUid === actor.uid) break
      plans.push(
        buildPlannedNotification({
          recipientUid,
          type: PASSIVE_NOTIFICATION_TYPES.BOARD_ACCESS_CHANGE,
          actor,
          entry,
        }),
      )
      break
    }
    case 'classification_change': {
      const areaId = await governingAreaFromEntry(entry)
      if (!areaId) break
      const areaName = await resolveAreaName(areaId)
      const recipients = excludeActor(uniqueMembers(await resolveAreaChiefs(areaId)), actor.uid)
      for (const recipient of recipients) {
        plans.push(
          buildPlannedNotification({
            recipientUid: recipient.uid,
            type: PASSIVE_NOTIFICATION_TYPES.CLASSIFICATION_CHANGED,
            actor,
            entry,
            areaId,
            areaName,
          }),
        )
      }
      break
    }
    case 'delete': {
      const areaId = await governingAreaFromEntry(entry)
      if (!areaId) break
      const areaName = await resolveAreaName(areaId)
      const recipients = excludeActor(uniqueMembers(await resolveAreaChiefs(areaId)), actor.uid)
      for (const recipient of recipients) {
        plans.push(
          buildPlannedNotification({
            recipientUid: recipient.uid,
            type: PASSIVE_NOTIFICATION_TYPES.FILE_DELETED,
            actor,
            entry,
            areaId,
            areaName,
          }),
        )
      }
      break
    }
    default:
      break
  }

  return plans
}

export async function emitNotificationsFromAudit(entry: AuditLogEntry): Promise<void> {
  const plans = await planNotificationsFromAudit(entry)
  if (plans.length === 0) return
  await writeNotificationsBestEffort(plans)
}

export async function emitNotificationsFromAuditBestEffort(entry: AuditLogEntry): Promise<void> {
  try {
    await emitNotificationsFromAudit(entry)
  } catch (err) {
    logError('notifications: falló la planificación/emisión', err)
  }
}
