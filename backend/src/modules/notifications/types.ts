export const PASSIVE_NOTIFICATION_TYPES = {
  FILE_CREATED_IN_AREA: 'file_created_in_area',
  ACCESS_GRANTED: 'access_granted',
  ACCESS_REVOKED: 'access_revoked',
  AUTHORIZED_COPY: 'authorized_copy',
  USER_GOVERNANCE_CHANGE: 'user_governance_change',
  BOARD_ACCESS_CHANGE: 'board_access_change',
  CLASSIFICATION_CHANGED: 'classification_changed',
  FILE_DELETED: 'file_deleted',
  ACCESS_REQUEST_APPROVED: 'access_request_approved',
  ACCESS_REQUEST_REJECTED: 'access_request_rejected',
  OFFICE_UPLOAD_APPROVED: 'office_upload_approved',
  OFFICE_UPLOAD_REJECTED: 'office_upload_rejected',
} as const

export type PassiveNotificationType =
  (typeof PASSIVE_NOTIFICATION_TYPES)[keyof typeof PASSIVE_NOTIFICATION_TYPES]

export const ACTIONABLE_NOTIFICATION_TYPES = {
  ACCESS_REQUEST: 'access_request',
  OFFICE_UPLOAD_REQUEST: 'office_upload_request',
} as const

export type ActionableNotificationType =
  (typeof ACTIONABLE_NOTIFICATION_TYPES)[keyof typeof ACTIONABLE_NOTIFICATION_TYPES]

export type NotificationType = PassiveNotificationType | ActionableNotificationType

export type NotificationCategory = 'passive' | 'actionable'

export type NotificationActor = {
  uid: string
  email: string
  displayName: string | null
}

export type NotificationDeepLink = {
  path: string
}

export type NotificationContext = {
  areaId?: string | null
  areaName?: string | null
  fileId?: string | null
  fileName?: string | null
  boardId?: string | null
  boardName?: string | null
  auditAction?: string
  [key: string]: unknown
}

export type PlannedNotification = {
  recipientUid: string
  type: NotificationType
  category: NotificationCategory
  actor: NotificationActor
  title: string
  body: string
  deepLink: NotificationDeepLink | null
  context: NotificationContext
  dedupeKey: string
}
