import type { Request, Response } from 'express'
import { Timestamp, type Query } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'

const COLLECTION = 'auditLogs'
const DEFAULT_PAGE = 25
const MAX_PAGE = 100

const FILTERS = ['userId', 'targetId', 'action'] as const
type FilterBy = (typeof FILTERS)[number]

const ACTIONS = [
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
] as const

function isFilterBy(value: string): value is FilterBy {
  return (FILTERS as readonly string[]).includes(value)
}

function parsePageSize(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE
  return Math.min(MAX_PAGE, Math.floor(n))
}

function parseBound(raw: unknown, endOfDay: boolean): Timestamp | null | 'invalid' {
  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw !== 'string') return 'invalid'
  const trimmed = raw.trim()
  let d: Date
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    d = new Date(`${trimmed}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
  } else {
    d = new Date(trimmed)
  }
  if (Number.isNaN(d.getTime())) return 'invalid'
  return Timestamp.fromDate(d)
}

function serializeCreatedAt(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  return null
}

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const filterByRaw = typeof req.query.filterBy === 'string' ? req.query.filterBy.trim() : ''
  const valueRaw = typeof req.query.value === 'string' ? req.query.value.trim() : ''

  if (filterByRaw && !isFilterBy(filterByRaw)) {
    res.status(400).json({ error: "filterBy debe ser 'userId', 'targetId' o 'action'" })
    return
  }
  if (filterByRaw && !valueRaw) {
    res.status(400).json({ error: 'value es obligatorio cuando hay filterBy' })
    return
  }
  if (filterByRaw === 'action' && !(ACTIONS as readonly string[]).includes(valueRaw)) {
    res.status(400).json({ error: 'action no reconocida' })
    return
  }

  const start = parseBound(req.query.startDate, false)
  const end = parseBound(req.query.endDate, true)
  if (start === 'invalid' || end === 'invalid') {
    res.status(400).json({ error: 'startDate o endDate inválidos' })
    return
  }

  const pageSize = parsePageSize(req.query.pageSize)
  const pageToken =
    typeof req.query.pageToken === 'string' && req.query.pageToken.trim().length > 0
      ? req.query.pageToken.trim()
      : null
  if (pageToken && !/^[\w-]+$/.test(pageToken)) {
    res.status(400).json({ error: 'pageToken inválido' })
    return
  }

  try {
    const db = adminDb()
    let q: Query = db.collection(COLLECTION)

    if (filterByRaw === 'userId') q = q.where('userId', '==', valueRaw)
    if (filterByRaw === 'targetId') q = q.where('targetId', '==', valueRaw)
    if (filterByRaw === 'action') q = q.where('action', '==', valueRaw)

    if (start) q = q.where('createdAt', '>=', start)
    if (end) q = q.where('createdAt', '<=', end)

    q = q.orderBy('createdAt', 'desc')

    if (pageToken) {
      const cursor = await db.collection(COLLECTION).doc(pageToken).get()
      if (!cursor.exists) {
        res.status(400).json({ error: 'pageToken no corresponde a un log' })
        return
      }
      q = q.startAfter(cursor)
    }

    const snap = await q.limit(pageSize + 1).get()
    const hasMore = snap.docs.length > pageSize
    const docs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs

    const logs = docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        userId: data.userId ?? '',
        userEmail: data.userEmail ?? '',
        action: data.action ?? '',
        targetType: data.targetType ?? '',
        targetId: data.targetId ?? '',
        targetName: data.targetName ?? '',
        parentFolderId: data.parentFolderId ?? null,
        mimeType: data.mimeType ?? null,
        reason: data.reason ?? null,
        metadata:
          data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
            ? data.metadata
            : {},
        createdAt: serializeCreatedAt(data.createdAt),
      }
    })

    res.json({
      logs,
      nextPageToken: hasMore ? (docs[docs.length - 1]?.id ?? null) : null,
    })
  } catch (err) {
    logError('auditLogs listado falló', err)
    res.status(502).json({ error: 'No se pudieron leer los logs' })
  }
}
