import { auth } from './firebase'

export interface ApplyPendingSetupResult {
  applied: boolean
  reason?: string
}

export type GovernanceAction =
  | 'approval'
  | 'permission_grant'
  | 'classification_change'
  | 'authorized_copy'

export type ActionGrants = Partial<Record<GovernanceAction, string[]>>

async function authFetch(path: string, init: RequestInit): Promise<Response> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) {
    throw new Error('No autenticado')
  }

  return fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return body.error ?? `Error ${res.status}`
}

export interface BootstrapProfileInput {
  source: 'register' | 'google'
  displayName?: string
  department?: string
  birthDate?: string
}

export interface BootstrapProfileResult {
  created: boolean
  syncedSuperAdmin?: boolean
}

/** Crea o sincroniza users/{uid} vía backend (Admin SDK). Idempotente. */
export async function bootstrapUserProfileAfterAuth(
  input: BootstrapProfileInput,
): Promise<BootstrapProfileResult> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) {
    throw new Error('No autenticado')
  }

  const res = await fetch('/api/users/bootstrap-profile', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Error ${res.status}`)
  }

  return (await res.json()) as BootstrapProfileResult
}

/** Idempotente: aplica pendingUserSetup/{email} vía backend (Admin SDK). */
export async function applyPendingUserSetupAfterRegister(): Promise<ApplyPendingSetupResult | null> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) return null

  const res = await fetch('/api/users/apply-pending-setup', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Error ${res.status}`)
  }

  return (await res.json()) as ApplyPendingSetupResult
}

/** Grant/revoke puntual de excepción de gobernanza (solo super_admin). */
export async function patchUserActionGrants(
  uid: string,
  input: {
    action: GovernanceAction
    areaId: string
    operation: 'grant' | 'revoke'
    reason: string
  },
): Promise<{ actionGrants: ActionGrants }> {
  const res = await authFetch(`/api/users/${encodeURIComponent(uid)}/action-grants`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return (await res.json()) as { actionGrants: ActionGrants }
}

/** Reemplazo de áreas administradas (solo super_admin). */
export async function patchUserManagedAreas(
  uid: string,
  areaIds: string[],
  reason: string,
): Promise<{ managedAreaIds: string[] }> {
  const res = await authFetch(`/api/users/${encodeURIComponent(uid)}/managed-areas`, {
    method: 'PATCH',
    body: JSON.stringify({ areaIds, reason }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return (await res.json()) as { managedAreaIds: string[] }
}

/** Reemplazo de áreas de pertenencia (solo super_admin). */
export async function patchUserMemberAreas(
  uid: string,
  areaIds: string[],
  reason: string,
): Promise<{ memberAreaIds: string[] }> {
  const res = await authFetch(`/api/users/${encodeURIComponent(uid)}/member-areas`, {
    method: 'PATCH',
    body: JSON.stringify({ areaIds, reason }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return (await res.json()) as { memberAreaIds: string[] }
}

/** Restablecer contraseña (solo super_admin). Devuelve contraseña temporal una sola vez. */
export async function resetUserPassword(
  uid: string,
  reason: string,
): Promise<{ uid: string; email: string; temporaryPassword: string }> {
  const res = await authFetch(`/api/users/${encodeURIComponent(uid)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return (await res.json()) as { uid: string; email: string; temporaryPassword: string }
}

export interface PendingExternalAccountDto {
  uid: string
  email: string
  displayName: string
  department: string
  accountType: 'external'
  createdAt: string | null
}

export async function listPendingExternalAccounts(): Promise<PendingExternalAccountDto[]> {
  const res = await authFetch('/api/users/pending-external-accounts', { method: 'GET' })
  if (!res.ok) throw new Error(await parseError(res))
  const body = (await res.json()) as { accounts: PendingExternalAccountDto[] }
  return body.accounts ?? []
}

export async function approveExternalAccount(uid: string, reason: string): Promise<void> {
  const res = await authFetch(`/api/users/${encodeURIComponent(uid)}/approve-external`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) throw new Error(await parseError(res))
}

export async function rejectExternalAccount(uid: string, reason: string): Promise<void> {
  const res = await authFetch(`/api/users/${encodeURIComponent(uid)}/reject-external`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) throw new Error(await parseError(res))
}
