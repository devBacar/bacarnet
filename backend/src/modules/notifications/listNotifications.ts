import type { Request, Response } from 'express'
import { Timestamp, type DocumentData } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'

const DEFAULT_PAGE_SIZE = 30
const MAX_PAGE_SIZE = 100

function serializeTimestamp(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  return null
}

function mapNotificationDoc(id: string, data: DocumentData) {
  return {
    id,
    type: data.type ?? null,
    category: data.category ?? 'passive',
    read: data.read === true,
    createdAt: serializeTimestamp(data.createdAt),
    actor: data.actor ?? null,
    title: typeof data.title === 'string' ? data.title : '',
    body: typeof data.body === 'string' ? data.body : '',
    deepLink: data.deepLink ?? null,
    context: data.context ?? {},
  }
}

export async function listNotifications(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const unreadOnly = req.query.unreadOnly === 'true'
  const pageSizeRaw = Number.parseInt(String(req.query.pageSize ?? DEFAULT_PAGE_SIZE), 10)
  const pageSize = Number.isFinite(pageSizeRaw)
    ? Math.min(Math.max(pageSizeRaw, 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE
  const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken.trim() : ''

  try {
    let query = adminDb()
      .collection('users')
      .doc(user.uid)
      .collection('notifications')
      .orderBy('createdAt', 'desc')
      .limit(pageSize + 1)

    if (unreadOnly) {
      query = adminDb()
        .collection('users')
        .doc(user.uid)
        .collection('notifications')
        .where('read', '==', false)
        .orderBy('createdAt', 'desc')
        .limit(pageSize + 1)
    }

    if (pageToken) {
      const cursor = await adminDb()
        .collection('users')
        .doc(user.uid)
        .collection('notifications')
        .doc(pageToken)
        .get()
      if (cursor.exists) {
        query = query.startAfter(cursor)
      }
    }

    const snap = await query.get()
    const docs = snap.docs.slice(0, pageSize)
    const hasMore = snap.docs.length > pageSize

    res.json({
      notifications: docs.map((doc) => mapNotificationDoc(doc.id, doc.data())),
      nextPageToken: hasMore ? docs[docs.length - 1]?.id ?? null : null,
    })
  } catch (err) {
    logError('listNotifications falló', err)
    res.status(500).json({ error: 'No se pudieron listar las notificaciones' })
  }
}

export async function markNotificationRead(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const notificationId = String(req.params.notificationId ?? '').trim()
  if (!notificationId) {
    res.status(400).json({ error: 'notificationId inválido' })
    return
  }

  const ref = adminDb()
    .collection('users')
    .doc(user.uid)
    .collection('notifications')
    .doc(notificationId)

  try {
    const snap = await ref.get()
    if (!snap.exists) {
      res.status(404).json({ error: 'Notificación no encontrada' })
      return
    }

    await ref.update({ read: true })
    res.json({ id: notificationId, read: true })
  } catch (err) {
    logError('markNotificationRead falló', err)
    res.status(500).json({ error: 'No se pudo marcar la notificación como leída' })
  }
}

export async function markAllNotificationsRead(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  try {
    const snap = await adminDb()
      .collection('users')
      .doc(user.uid)
      .collection('notifications')
      .where('read', '==', false)
      .limit(500)
      .get()

    if (snap.empty) {
      res.json({ updated: 0 })
      return
    }

    const batch = adminDb().batch()
    for (const doc of snap.docs) {
      batch.update(doc.ref, { read: true })
    }
    await batch.commit()
    res.json({ updated: snap.size })
  } catch (err) {
    logError('markAllNotificationsRead falló', err)
    res.status(500).json({ error: 'No se pudieron marcar las notificaciones como leídas' })
  }
}

export async function getUnreadNotificationCount(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  try {
    const snap = await adminDb()
      .collection('users')
      .doc(user.uid)
      .collection('notifications')
      .where('read', '==', false)
      .get()

    res.json({ unreadCount: snap.size })
  } catch (err) {
    logError('getUnreadNotificationCount falló', err)
    res.status(500).json({ error: 'No se pudo obtener el contador de notificaciones' })
  }
}
