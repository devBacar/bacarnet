import type { Request, Response } from 'express'
import type { AuthedUser } from '../auth/middleware.js'
import { isSuperAdminUser } from '../auth/middleware.js'
import { writeAuditLog, type AuditLogEntry } from './writeAuditLog.js'

const CLIENT_AUDIT_ACTIONS = [
  'create',
  'delete',
  'edit',
  'rename',
  'permission_grant',
  'permission_revoke',
  'role_change',
  'managed_areas_change',
  'member_areas_change',
  'action_grants_change',
  'classification_change',
  'authorized_copy',
  'approval',
  'board_view',
] as const

type ClientAuditAction = (typeof CLIENT_AUDIT_ACTIONS)[number]

const USER_ADMIN_ACTIONS = new Set<ClientAuditAction>([
  'role_change',
  'managed_areas_change',
  'member_areas_change',
  'action_grants_change',
])

const TARGET_TYPES = new Set<AuditLogEntry['targetType']>([
  'folder',
  'file',
  'resource',
  'user',
  'board',
])

function isClientAuditAction(value: unknown): value is ClientAuditAction {
  return typeof value === 'string' && (CLIENT_AUDIT_ACTIONS as readonly string[]).includes(value)
}

/** Quién puede registrar cada acción desde el cliente. */
export function clientMayRecordAuditAction(user: AuthedUser, action: ClientAuditAction): boolean {
  if (isSuperAdminUser(user)) return true
  if (USER_ADMIN_ACTIONS.has(action)) return user.permissions.manage_users === true
  if (action === 'board_view') return true
  return user.role === 'admin' || user.permissions.manage_users === true
}

function readString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

function readNullableString(value: unknown, max: number): string | null {
  if (value == null || value === '') return null
  return readString(value, max)
}

function readMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  try {
    const json = JSON.stringify(value)
    if (json.length > 8000) return {}
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function recordClientAuditAction(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const body = req.body as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Body inválido' })
    return
  }

  if (!isClientAuditAction(body.action)) {
    res.status(400).json({ error: 'Acción de auditoría no permitida' })
    return
  }

  if (!clientMayRecordAuditAction(user, body.action)) {
    res.status(403).json({ error: 'No tenés permiso para registrar esta acción' })
    return
  }

  const targetType = body.targetType
  if (typeof targetType !== 'string' || !TARGET_TYPES.has(targetType as AuditLogEntry['targetType'])) {
    res.status(400).json({ error: 'targetType inválido' })
    return
  }

  const targetId = readString(body.targetId, 300)
  const targetName = readString(body.targetName, 500)
  if (!targetId || !targetName) {
    res.status(400).json({ error: 'targetId y targetName son obligatorios' })
    return
  }

  if (USER_ADMIN_ACTIONS.has(body.action) && targetType !== 'user') {
    res.status(400).json({ error: 'Esa acción solo aplica a un usuario' })
    return
  }

  await writeAuditLog({
    userId: user.uid,
    userEmail: user.email,
    action: body.action,
    targetType: targetType as AuditLogEntry['targetType'],
    targetId,
    targetName,
    parentFolderId: readNullableString(body.parentFolderId, 300),
    mimeType: readNullableString(body.mimeType, 200),
    reason: readNullableString(body.reason, 2000),
    metadata: readMetadata(body.metadata),
  })

  res.status(201).json({ ok: true })
}
