import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { useGlobalSettings } from './GlobalSettingsContext'
import {
  markAllNotificationsReadClient,
  markNotificationReadClient,
  subscribeRecentNotifications,
  subscribeUnreadNotifications,
} from '../services/notificationsService'
import type { NotificationSnapshot } from '../services/notificationsTypes'

interface NotificationsContextValue {
  unreadCount: number
  unreadNotifications: NotificationSnapshot[]
  recentNotifications: NotificationSnapshot[]
  loading: boolean
  permissionDenied: boolean
  markRead: (notificationId: string) => Promise<void>
  markAllRead: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { settings } = useGlobalSettings()
  const [unreadNotifications, setUnreadNotifications] = useState<NotificationSnapshot[]>([])
  const [recentNotifications, setRecentNotifications] = useState<NotificationSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [permissionDenied, setPermissionDenied] = useState(false)

  useEffect(() => {
    if (!settings.notificationsEnabled || !user?.uid) {
      setUnreadNotifications([])
      setRecentNotifications([])
      setPermissionDenied(false)
      setLoading(false)
      return
    }

    setLoading(true)

    const unsubUnread = subscribeUnreadNotifications(
      user.uid,
      (items) => {
        setUnreadNotifications(items)
        setPermissionDenied(false)
        setLoading(false)
      },
      (error) => {
        const code = (error as { code?: string }).code
        if (code === 'permission-denied') {
          setPermissionDenied(true)
        }
        setLoading(false)
      },
    )

    const unsubRecent = subscribeRecentNotifications(
      user.uid,
      (items) => {
        setRecentNotifications(items)
      },
      () => {
        // El contador unread ya refleja permisos; no bloqueamos el panel por esto.
      },
    )

    return () => {
      unsubUnread()
      unsubRecent()
    }
  }, [user?.uid, settings.notificationsEnabled])

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!user?.uid) return
      await markNotificationReadClient(notificationId)
    },
    [user?.uid],
  )

  const markAllRead = useCallback(async () => {
    await markAllNotificationsReadClient()
  }, [])

  const value = useMemo(
    () => ({
      unreadCount: unreadNotifications.length,
      unreadNotifications,
      recentNotifications,
      loading,
      permissionDenied,
      markRead,
      markAllRead,
    }),
    [
      unreadNotifications,
      recentNotifications,
      loading,
      permissionDenied,
      markRead,
      markAllRead,
    ],
  )

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationsContext)
  if (!context) {
    throw new Error('useNotifications debe usarse dentro de NotificationsProvider')
  }
  return context
}
