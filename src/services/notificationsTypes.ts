export type NotificationCategory = 'passive' | 'actionable'

export type NotificationActor = {
  uid: string
  email: string
  displayName: string | null
}

export type NotificationDeepLink = {
  path: string
}

export type NotificationDto = {
  id: string
  type: string
  category: NotificationCategory
  read: boolean
  createdAt: string | null
  actor: NotificationActor | null
  title: string
  body: string
  deepLink: NotificationDeepLink | null
  context: Record<string, unknown>
}

export type NotificationSnapshot = NotificationDto & {
  createdAtMs: number
}
