import {
  CALENDAR_READONLY_SCOPES,
  GMAIL_READONLY_SCOPES,
} from '../../config/env.js'

export const GOOGLE_PERSONAL_INTEGRATIONS_COLLECTION = 'user_google_integrations'

export const WIDGET_OAUTH_SCOPES = [
  ...GMAIL_READONLY_SCOPES,
  ...CALENDAR_READONLY_SCOPES,
] as const

export const OAUTH_STATE_TTL_SECONDS = 600
