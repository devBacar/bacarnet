import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import { emitNotificationsFromAuditBestEffort } from '../notifications/emitFromAudit.js'

const AUDIT_LOGS_COLLECTION = 'auditLogs'

export type AuditLogEntry = {
  userId: string
  userEmail: string
  action:
    | 'create'
    | 'delete'
    | 'edit'
    | 'rename'
    | 'permission_grant'
    | 'permission_revoke'
    | 'role_change'
    | 'managed_areas_change'
    | 'member_areas_change'
    | 'action_grants_change'
    | 'password_reset'
    | 'classification_change'
    | 'authorized_copy'
    | 'approval'
    | 'board_view'
    | 'board_access_grant'
    | 'board_access_revoke'
    | 'pending_setup_applied'
    | 'external_account_approved'
    | 'external_account_rejected'
    | 'audit_correction'
  targetType: 'folder' | 'file' | 'resource' | 'user' | 'board'
  targetId: string
  targetName: string
  parentFolderId: string | null
  mimeType: string | null
  reason: string | null
  metadata?: Record<string, unknown>
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  await adminDb()
    .collection(AUDIT_LOGS_COLLECTION)
    .add({
      userId: entry.userId,
      userEmail: entry.userEmail,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      targetName: entry.targetName,
      parentFolderId: entry.parentFolderId,
      mimeType: entry.mimeType,
      reason: entry.reason,
      metadata: entry.metadata ?? {},
      createdAt: FieldValue.serverTimestamp(),
    })
}

/** Nunca tira: la acción en Drive ya ocurrió. */
export async function writeAuditLogBestEffort(entry: AuditLogEntry): Promise<void> {
  try {
    await writeAuditLog(entry)
  } catch (err) {
    logError('auditLogs: falló el registro (el archivo en Drive no se revierte)', err)
    return
  }

  await emitNotificationsFromAuditBestEffort(entry)
}
