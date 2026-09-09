import type { Request } from 'express'
import { isSuperAdminUser } from '../auth/middleware.js'
import type { RagConfig } from './types.js'

export function hasRagAssistantPermission(
  user: NonNullable<Request['authedUser']>,
): boolean {
  if (isSuperAdminUser(user)) return true
  return user.permissions.rag_assistant === true
}

/** super_admin siempre; demás usuarios con rag.enabled=true y permissions.rag_assistant. */
export function isPilotAccessAllowed(
  config: RagConfig,
  user: NonNullable<Request['authedUser']>,
): boolean {
  if (isSuperAdminUser(user)) return true
  if (!config.enabled) return false
  return hasRagAssistantPermission(user)
}
