import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import { auth, db } from './firebase'
import type { NotificationSnapshot } from './notificationsTypes'

function mapDoc(id: string, data: DocumentData): NotificationSnapshot {
  const createdAtRaw = data.createdAt
  let createdAt: string | null = null
  let createdAtMs = 0
  if (createdAtRaw && typeof createdAtRaw.toDate === 'function') {
    const date = createdAtRaw.toDate() as Date
    createdAt = date.toISOString()
    createdAtMs = date.getTime()
  }

  return {
    id,
    type: typeof data.type === 'string' ? data.type : 'unknown',
    category: data.category === 'actionable' ? 'actionable' : 'passive',
    read: data.read === true,
    createdAt,
    createdAtMs,
    actor:
      data.actor && typeof data.actor === 'object' && !Array.isArray(data.actor)
        ? {
            uid: String((data.actor as Record<string, unknown>).uid ?? ''),
            email: String((data.actor as Record<string, unknown>).email ?? ''),
            displayName:
              typeof (data.actor as Record<string, unknown>).displayName === 'string'
                ? ((data.actor as Record<string, unknown>).displayName as string)
                : null,
          }
        : null,
    title: typeof data.title === 'string' ? data.title : '',
    body: typeof data.body === 'string' ? data.body : '',
    deepLink:
      data.deepLink &&
      typeof data.deepLink === 'object' &&
      !Array.isArray(data.deepLink) &&
      typeof (data.deepLink as Record<string, unknown>).path === 'string'
        ? { path: (data.deepLink as Record<string, unknown>).path as string }
        : null,
    context:
      data.context && typeof data.context === 'object' && !Array.isArray(data.context)
        ? (data.context as Record<string, unknown>)
        : {},
  }
}

export function subscribeUnreadNotifications(
  uid: string,
  onData: (items: NotificationSnapshot[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'users', uid, 'notifications'),
    where('read', '==', false),
    orderBy('createdAt', 'desc'),
    limit(50),
  )

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((doc) => mapDoc(doc.id, doc.data())))
    },
    (error) => {
      onError?.(error)
    },
  )
}

export function subscribeRecentNotifications(
  uid: string,
  onData: (items: NotificationSnapshot[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'users', uid, 'notifications'),
    orderBy('createdAt', 'desc'),
    limit(20),
  )

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((doc) => mapDoc(doc.id, doc.data())))
    },
    (error) => {
      onError?.(error)
    },
  )
}

export async function markNotificationReadClient(notificationId: string): Promise<void> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('No autenticado')

  const res = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) {
    throw new Error(body.error ?? `Error ${res.status}`)
  }
}

export async function markAllNotificationsReadClient(): Promise<number> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('No autenticado')

  const res = await fetch('/api/notifications/read-all', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string; updated?: number }
  if (!res.ok) {
    throw new Error(body.error ?? `Error ${res.status}`)
  }
  return body.updated ?? 0
}
