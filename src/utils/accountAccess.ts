import type { UserProfile } from '../services/userService'

export type AccountType = 'corporate' | 'external'
export type AccountStatus = 'active' | 'pending_approval' | 'rejected'

export const CORPORATE_EMAIL_DOMAIN = 'bacarsa.com.ar'

export function isCorporateEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return email.trim().toLowerCase().endsWith(`@${CORPORATE_EMAIL_DOMAIN}`)
}

export function resolveAccountType(email: string | null | undefined): AccountType {
  return isCorporateEmail(email) ? 'corporate' : 'external'
}

export function resolveAccountStatus(
  raw: unknown,
): AccountStatus {
  if (raw === 'pending_approval' || raw === 'rejected') return raw
  return 'active'
}

export function isExternalAccount(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false
  if (profile.accountType === 'external') return true
  if (profile.accountType === 'corporate') return false
  return !isCorporateEmail(profile.email)
}

export function isAccountPending(profile: UserProfile | null | undefined): boolean {
  return (profile?.accountStatus ?? 'active') === 'pending_approval'
}

export function isAccountRejected(profile: UserProfile | null | undefined): boolean {
  return profile?.accountStatus === 'rejected'
}

export function isAccountActive(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false
  return (profile.accountStatus ?? 'active') === 'active'
}
