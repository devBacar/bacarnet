import { getEnv } from '../../config/env.js'

export const WIDGETS_NOT_CONFIGURED_CODE = 'widgets_not_configured' as const

export function isWidgetsOAuthConfigured(): boolean {
  const env = getEnv()
  return Boolean(
    env.widgetsOAuthClientId &&
      env.widgetsOAuthClientSecret &&
      env.widgetsOAuthTokenEncryptionKey &&
      env.widgetsOAuthStateSecret,
  )
}
