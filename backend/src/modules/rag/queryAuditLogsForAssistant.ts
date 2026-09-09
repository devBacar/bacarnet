import { Timestamp, type Query } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { sanitizeAuditLogRow } from './ragReadableLabels.js'

const COLLECTION = 'auditLogs'
const DEFAULT_LIMIT = 15
const MAX_LIMIT = 25
const MAX_SCAN = 120

const VALID_ACTIONS = new Set([
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
  'password_reset',
  'classification_change',
  'authorized_copy',
  'approval',
  'audit_correction',
])

function parseIsoDate(value: string, endOfDay = false): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  if (endOfDay) return new Date(Date.UTC(year, month, day, 23, 59, 59, 999))
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0))
}

function serializeCreatedAt(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  return null
}

async function resolveUserIdByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase()
  const snap = await adminDb().collection('users').where('email', '==', normalized).limit(1).get()
  if (snap.empty) return null
  return snap.docs[0]?.id ?? null
}

function matchesTargetName(targetName: string, query: string): boolean {
  return targetName.trim().toLowerCase().includes(query.trim().toLowerCase())
}

export async function queryAuditLogsForAssistant(input: {
  actorEmail?: string
  action?: string
  targetName?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
}): Promise<Record<string, unknown>> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, input.limit ?? DEFAULT_LIMIT))
  const action = input.action?.trim()
  if (action && !VALID_ACTIONS.has(action)) {
    return { error: 'INVALID_ARGS', message: `Acción no reconocida: ${action}` }
  }

  const from = input.dateFrom ? parseIsoDate(input.dateFrom) : null
  const to = input.dateTo ? parseIsoDate(input.dateTo, true) : null
  if (input.dateFrom && !from) {
    return { error: 'INVALID_ARGS', message: 'dateFrom debe ser YYYY-MM-DD.' }
  }
  if (input.dateTo && !to) {
    return { error: 'INVALID_ARGS', message: 'dateTo debe ser YYYY-MM-DD.' }
  }
  if (from && to && from.getTime() > to.getTime()) {
    return { error: 'INVALID_ARGS', message: 'dateFrom no puede ser posterior a dateTo.' }
  }

  const effectiveFrom =
    from ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const effectiveTo = to ?? new Date()

  let actorUserId: string | null = null
  if (input.actorEmail?.trim()) {
    actorUserId = await resolveUserIdByEmail(input.actorEmail)
    if (!actorUserId) {
      return {
        matchCount: 0,
        events: [],
        note: `No encontré un usuario con el email ${input.actorEmail.trim().toLowerCase()}.`,
      }
    }
  }

  let q: Query = adminDb().collection(COLLECTION)
  if (actorUserId) q = q.where('userId', '==', actorUserId)
  if (action) q = q.where('action', '==', action)
  q = q.where('createdAt', '>=', Timestamp.fromDate(effectiveFrom))
  q = q.where('createdAt', '<=', Timestamp.fromDate(effectiveTo))
  q = q.orderBy('createdAt', 'desc')

  const snap = await q.limit(input.targetName?.trim() ? MAX_SCAN : limit).get()
  const targetQuery = input.targetName?.trim().toLowerCase() ?? ''

  const filtered = snap.docs.filter((doc) => {
    if (!targetQuery) return true
    const targetName = doc.get('targetName')
    return typeof targetName === 'string' && matchesTargetName(targetName, targetQuery)
  })

  const selected = filtered.slice(0, limit)
  const events = await Promise.all(
    selected.map(async (doc) => {
      const data = doc.data()
      return sanitizeAuditLogRow({
        userId: data.userId,
        userEmail: data.userEmail,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        targetName: data.targetName,
        reason: data.reason ?? null,
        metadata:
          data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
            ? (data.metadata as Record<string, unknown>)
            : {},
        createdAt: serializeCreatedAt(data.createdAt),
      })
    }),
  )

  return {
    matchCount: events.length,
    events,
    truncated: filtered.length > limit,
    note: 'Eventos de auditoría interna. Solo nombres, emails y acciones legibles — sin IDs técnicos.',
  }
}
