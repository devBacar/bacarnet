import { getEnv, isEmailInAllowedDomain } from '../../config/env.js'

export const SUPER_ADMIN_EMAILS = new Set([
  'admin@bacarsa.com.ar',
  'sistemas.ti@bacarsa.com.ar',
])

export const DEFAULT_HOME_WIDGET_PREFERENCES = {
  weather: true,
  dollar: true,
} as const

export const EXTERNAL_PENDING_PERMISSIONS = {
  view_directory: false,
  view_drive: false,
  view_links: false,
  manage_news: false,
  manage_links: false,
  manage_users: false,
  super_admin: false,
  rag_assistant: false,
} as const

export const DEFAULT_PERMISSIONS = {
  view_directory: true,
  view_drive: true,
  view_links: true,
  manage_news: false,
  manage_links: false,
  manage_users: false,
  super_admin: false,
  rag_assistant: false,
} as const

export const SUPER_ADMIN_PERMISSIONS = {
  view_directory: true,
  view_drive: true,
  view_links: true,
  manage_news: true,
  manage_links: true,
  manage_users: true,
  super_admin: true,
  rag_assistant: true,
} as const

export type BootstrapSource = 'register' | 'google'

export function isCorporateEmail(email: string): boolean {
  const domain = getEnv().allowedEmailDomain
  return isEmailInAllowedDomain(email, domain)
}

export function resolveAccountType(email: string): 'corporate' | 'external' {
  return isCorporateEmail(email) ? 'corporate' : 'external'
}

export function resolveRoleForEmail(email: string): 'super_admin' | 'user' {
  return SUPER_ADMIN_EMAILS.has(email.trim().toLowerCase()) ? 'super_admin' : 'user'
}

export function getPermissionsForEmail(email: string) {
  return resolveRoleForEmail(email) === 'super_admin'
    ? { ...SUPER_ADMIN_PERMISSIONS }
    : { ...DEFAULT_PERMISSIONS }
}

export function buildNewUserProfile(input: {
  email: string
  displayName: string
  department: string
  birthDate?: string
  source: BootstrapSource
}): Record<string, unknown> {
  const normalizedEmail = input.email.trim().toLowerCase()
  const corporate = isCorporateEmail(normalizedEmail)
  const accountType = resolveAccountType(normalizedEmail)
  const accountStatus = corporate ? 'active' : 'pending_approval'

  const profile: Record<string, unknown> = {
    email: normalizedEmail,
    displayName: input.displayName.trim() || normalizedEmail.split('@')[0] || 'Usuario',
    department: input.department.trim() || 'General',
    role: resolveRoleForEmail(normalizedEmail),
    accountType,
    accountStatus,
    permissions: corporate ? getPermissionsForEmail(normalizedEmail) : { ...EXTERNAL_PENDING_PERMISSIONS },
    favoriteApps: [],
    widgetPreferences: corporate
      ? { ...DEFAULT_HOME_WIDGET_PREFERENCES }
      : { weather: true, dollar: true },
  }

  if (input.birthDate?.trim()) {
    profile.birthDate = input.birthDate.trim()
  }

  return profile
}
