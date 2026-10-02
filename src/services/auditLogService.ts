import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import { auth, db } from './firebase'

export const AUDIT_LOGS_COLLECTION = 'auditLogs'

export type AuditAction =
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
  | 'classification_change'
  | 'authorized_copy'
  | 'approval'
  | 'board_view'

export type AuditTargetType = 'folder' | 'file' | 'resource' | 'user' | 'board'

export interface AuditLogEntry {
  id?: string
  userId: string
  userEmail: string
  action: AuditAction
  targetType: AuditTargetType
  targetId: string
  targetName: string
  parentFolderId: string | null
  mimeType: string | null
  reason: string | null
  metadata: Record<string, unknown>
  createdAt: Timestamp | Date
}

export interface LogActionInput {
  action: AuditAction
  targetType: AuditTargetType
  targetId: string
  targetName: string
  parentFolderId?: string | null
  mimeType?: string | null
  reason?: string | null
  metadata?: Record<string, unknown>
}

export interface GetAuditLogsOptions {
  userId?: string
  targetId?: string
  action?: AuditAction
  from?: Date
  to?: Date
  limit?: number
}

function mapDocToEntry(id: string, data: Record<string, unknown>): AuditLogEntry {
  return {
    id,
    userId: String(data.userId ?? ''),
    userEmail: String(data.userEmail ?? ''),
    action: data.action as AuditAction,
    targetType: data.targetType as AuditTargetType,
    targetId: String(data.targetId ?? ''),
    targetName: String(data.targetName ?? ''),
    parentFolderId: typeof data.parentFolderId === 'string' ? data.parentFolderId : null,
    mimeType: typeof data.mimeType === 'string' ? data.mimeType : null,
    reason: typeof data.reason === 'string' ? data.reason : null,
    metadata:
      data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {},
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt
        : data.createdAt instanceof Date
          ? data.createdAt
          : new Date(),
  }
}

/** Escribe un log de auditoría vía backend. Falla en silencio — nunca bloquea la acción principal. */
export async function logAction(input: LogActionInput): Promise<void> {
  try {
    const user = auth.currentUser
    if (!user) {
      console.error('[auditLog] logAction omitido: no hay usuario autenticado', input.action)
      return
    }

    const token = await user.getIdToken()
    const res = await fetch('/api/audit/actions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        targetName: input.targetName,
        parentFolderId: input.parentFolderId ?? null,
        mimeType: input.mimeType ?? null,
        reason: input.reason ?? null,
        metadata: input.metadata ?? {},
      }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      console.error('[auditLog] Error al registrar acción:', input.action, body.error ?? res.status)
    }
  } catch (err) {
    console.error('[auditLog] Error al registrar acción:', input.action, err)
  }
}

/** Registra grants/revokes comparando allowedUsers antes y después. */
export async function logPermissionChanges(options: {
  targetType: 'folder' | 'resource' | 'file'
  targetId: string
  targetName: string
  parentFolderId?: string | null
  before: string[]
  after: string[]
}): Promise<void> {
  const beforeSet = new Set(options.before)
  const afterSet = new Set(options.after)
  const parentFolderId = options.parentFolderId ?? null

  for (const uid of options.after) {
    if (!beforeSet.has(uid)) {
      await logAction({
        action: 'permission_grant',
        targetType: options.targetType,
        targetId: options.targetId,
        targetName: options.targetName,
        parentFolderId,
        metadata: { granteeUid: uid },
      })
    }
  }

  for (const uid of options.before) {
    if (!afterSet.has(uid)) {
      await logAction({
        action: 'permission_revoke',
        targetType: options.targetType,
        targetId: options.targetId,
        targetName: options.targetName,
        parentFolderId,
        metadata: { granteeUid: uid },
      })
    }
  }
}

function buildBaseConstraints(options: GetAuditLogsOptions): QueryConstraint[] {
  const constraints: QueryConstraint[] = []

  // Una sola igualdad además del rango de fechas, para coincidir con los índices compuestos.
  if (options.userId) {
    constraints.push(where('userId', '==', options.userId))
  } else if (options.targetId) {
    constraints.push(where('targetId', '==', options.targetId))
  } else if (options.action) {
    constraints.push(where('action', '==', options.action))
  }

  if (options.from) {
    constraints.push(where('createdAt', '>=', options.from))
  }
  if (options.to) {
    constraints.push(where('createdAt', '<=', options.to))
  }

  constraints.push(orderBy('createdAt', 'desc'))
  constraints.push(limit(options.limit ?? 100))

  return constraints
}

async function runAuditQuery(constraints: QueryConstraint[]): Promise<AuditLogEntry[]> {
  const snapshot = await getDocs(query(collection(db, AUDIT_LOGS_COLLECTION), ...constraints))
  return snapshot.docs.map((docSnap) =>
    mapDocToEntry(docSnap.id, docSnap.data() as Record<string, unknown>),
  )
}

/**
 * Consulta logs de auditoría.
 * Las rules solo permiten list a super_admin; el backend (pasos 3–6) usará Admin SDK.
 */
export async function getAuditLogs(options: GetAuditLogsOptions = {}): Promise<AuditLogEntry[]> {
  return runAuditQuery(buildBaseConstraints(options))
}
