import type { AuditLogEntry } from '../audit/writeAuditLog.js'
import { getAreaDisplayName } from '../drive/resolveAreaMembers.js'
import {
  PASSIVE_NOTIFICATION_TYPES,
  type NotificationActor,
  type NotificationContext,
  type NotificationDeepLink,
  type PassiveNotificationType,
  type PlannedNotification,
} from './types.js'

const CLASSIFICATION_LABELS: Record<string, string> = {
  RESTRINGIDO: 'Restringido',
  CONFIDENCIAL: 'Confidencial',
  USO_INTERNO: 'Uso interno',
}

const ROLE_LABELS: Record<string, string> = {
  reader: 'lectura',
  writer: 'edición',
}

function actorLabel(actor: NotificationActor): string {
  return actor.displayName?.trim() || actor.email
}

function roleLabel(role: unknown): string {
  if (typeof role === 'string' && ROLE_LABELS[role]) return ROLE_LABELS[role]
  return typeof role === 'string' && role.length > 0 ? role : 'acceso'
}

function classificationLabel(value: unknown): string {
  if (typeof value === 'string' && CLASSIFICATION_LABELS[value]) return CLASSIFICATION_LABELS[value]
  return typeof value === 'string' ? value : '—'
}

function fileDeepLink(fileId: string): NotificationDeepLink {
  return { path: `/recursos/documento/${fileId}` }
}

function boardDeepLink(boardId: string): NotificationDeepLink {
  return { path: `/tableros/${boardId}` }
}

function governanceDeepLink(): NotificationDeepLink {
  return { path: '/intranet' }
}

export function buildPlannedNotification(input: {
  recipientUid: string
  type: PassiveNotificationType
  actor: NotificationActor
  entry: AuditLogEntry
  areaId?: string | null
  areaName?: string | null
  dedupeSuffix?: string
}): PlannedNotification {
  const { recipientUid, type, actor, entry, areaId, areaName, dedupeSuffix } = input
  const metadata = entry.metadata ?? {}
  const actorText = actorLabel(actor)
  const fileName = entry.targetName
  const fileId = entry.targetType === 'file' ? entry.targetId : null
  const boardId = entry.targetType === 'board' ? entry.targetId : null
  const boardName = entry.targetType === 'board' ? entry.targetName : null

  let title = 'Nueva notificación'
  let body = ''
  let deepLink: NotificationDeepLink | null = null
  const context: NotificationContext = {
    areaId: areaId ?? null,
    areaName: areaName ?? null,
    fileId,
    fileName: fileId ? fileName : null,
    boardId,
    boardName,
    auditAction: entry.action,
  }

  switch (type) {
    case PASSIVE_NOTIFICATION_TYPES.FILE_CREATED_IN_AREA:
      title = 'Archivo nuevo en tu área'
      body = `${actorText} creó «${fileName}»${areaName ? ` en ${areaName}` : ''}.`
      if (fileId) deepLink = fileDeepLink(fileId)
      break
    case PASSIVE_NOTIFICATION_TYPES.ACCESS_GRANTED:
      title = 'Acceso otorgado'
      body = `${actorText} te otorgó acceso de ${roleLabel(metadata.role)} a «${fileName}».`
      if (fileId) deepLink = fileDeepLink(fileId)
      break
    case PASSIVE_NOTIFICATION_TYPES.ACCESS_REVOKED:
      title = 'Acceso revocado'
      body = `${actorText} revocó tu acceso a «${fileName}».`
      if (fileId) deepLink = fileDeepLink(fileId)
      break
    case PASSIVE_NOTIFICATION_TYPES.AUTHORIZED_COPY:
      title = 'Copia autorizada'
      body = `${actorText} hizo una copia autorizada de «${fileName}»${areaName ? ` (${areaName})` : ''}.`
      if (fileId) deepLink = fileDeepLink(fileId)
      break
    case PASSIVE_NOTIFICATION_TYPES.USER_GOVERNANCE_CHANGE: {
      title = 'Cambio en tu perfil'
      if (entry.action === 'managed_areas_change') {
        body = 'Se actualizaron tus áreas administradas.'
      } else if (entry.action === 'member_areas_change') {
        body = 'Se actualizaron tus áreas de pertenencia.'
      } else if (entry.action === 'action_grants_change') {
        const op = metadata.operation === 'revoke' ? 'revocó' : 'otorgó'
        const area = typeof metadata.areaName === 'string' ? metadata.areaName : 'un área'
        body = `Se ${op} una excepción de gobernanza en ${area}.`
      } else {
        body = 'Hubo un cambio en tu rol o permisos de gobernanza.'
      }
      deepLink = governanceDeepLink()
      break
    }
    case PASSIVE_NOTIFICATION_TYPES.BOARD_ACCESS_CHANGE:
      if (entry.action === 'board_access_grant') {
        title = 'Acceso a tablero otorgado'
        body = `${actorText} te otorgó acceso al tablero «${boardName ?? entry.targetName}».`
      } else {
        title = 'Acceso a tablero revocado'
        body = `${actorText} revocó tu acceso al tablero «${boardName ?? entry.targetName}».`
      }
      if (boardId) deepLink = boardDeepLink(boardId)
      break
    case PASSIVE_NOTIFICATION_TYPES.CLASSIFICATION_CHANGED:
      title = 'Clasificación actualizada'
      body = `${actorText} cambió la clasificación de «${fileName}» a ${classificationLabel(metadata.classification)}.`
      if (fileId) deepLink = fileDeepLink(fileId)
      break
    case PASSIVE_NOTIFICATION_TYPES.FILE_DELETED:
      title = 'Archivo eliminado'
      body = `${actorText} envió «${fileName}» a la papelera${areaName ? ` (${areaName})` : ''}.`
      break
    default:
      body = `${actorText} realizó una acción sobre «${entry.targetName}».`
      break
  }

  const dedupeKey = [
    type,
    entry.action,
    entry.targetId,
    recipientUid,
    entry.userId,
    dedupeSuffix ?? '',
  ].join(':')

  return {
    recipientUid,
    type,
    category: 'passive',
    actor,
    title,
    body,
    deepLink,
    context,
    dedupeKey,
  }
}

export async function resolveAreaName(areaId: string | null | undefined): Promise<string | null> {
  if (!areaId) return null
  return getAreaDisplayName(areaId)
}
