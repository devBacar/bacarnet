import { Router } from 'express'
import { requireWorkspaceUser } from '../auth/middleware.js'
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './listNotifications.js'

export const notificationsRouter = Router()

notificationsRouter.get('/', requireWorkspaceUser, listNotifications)
notificationsRouter.get('/unread-count', requireWorkspaceUser, getUnreadNotificationCount)
notificationsRouter.patch('/read-all', requireWorkspaceUser, markAllNotificationsRead)
notificationsRouter.patch('/:notificationId/read', requireWorkspaceUser, markNotificationRead)
