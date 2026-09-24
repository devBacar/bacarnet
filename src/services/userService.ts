import { createUserWithEmailAndPassword, updateProfile, type User } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore'
import { auth, db } from './firebase'
import { logAction } from './auditLogService'
import { applyPendingUserSetupAfterRegister, bootstrapUserProfileAfterAuth, patchUserManagedAreas, patchUserMemberAreas } from './usersApi'
import {
  resolveHomeWidgetPreferences,
  type HomeWidgetId,
  type HomeWidgetPreferences,
} from '../constants/homeWidgets'
import {
  isCorporateEmail,
  resolveAccountStatus,
  resolveAccountType,
  type AccountStatus,
  type AccountType,
} from '../utils/accountAccess'

const USERS_COLLECTION = 'users'

export type UserDepartment = string

export type UserRole = 'super_admin' | 'admin' | 'user'

export type { AccountStatus, AccountType }

export type GovernanceAction =
  | 'approval'
  | 'permission_grant'
  | 'classification_change'
  | 'authorized_copy'

export type ActionGrants = Partial<Record<GovernanceAction, string[]>>

/**
 * @deprecated Reemplazado por `role` (+ `managedAreaIds` para admins de área).
 * Se mantiene por compatibilidad con código que aún lee flags booleanos.
 */
export interface UserPermissions {
  /** @deprecated Usar `role` / `isUser` / helpers de rol. */
  view_directory: boolean
  /** @deprecated Usar `role` / helpers de rol. */
  view_drive: boolean
  /** @deprecated Usar `role` / helpers de rol. */
  view_links: boolean
  /** @deprecated Usar `role` / helpers de rol. */
  manage_news: boolean
  /** @deprecated Usar `role` / helpers de rol. */
  manage_links: boolean
  /** @deprecated Usar `role` / helpers de rol. */
  manage_users: boolean
  /** @deprecated Usar `role === 'super_admin'` / `isSuperAdmin(profile)`. */
  super_admin: boolean
  /** Acceso al asistente RAG (chat flotante). super_admin siempre. */
  rag_assistant: boolean
  /** Módulo Finanzas (saldos bancarios). */
  view_finanzas: boolean
  /** Líder de cajas (crear cajas, aprobar cierres). */
  manage_finanzas_caja: boolean
}

export interface PersonalLink {
  id: string
  title: string
  url: string
  order: number
}

export const MAX_PERSONAL_LINKS = 20

const PERSONAL_LINK_URL_PATTERN = /^https?:\/\/.+/i

export function isValidPersonalLinkUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!PERSONAL_LINK_URL_PATTERN.test(trimmed)) return false
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function parsePersonalLinks(raw: unknown): PersonalLink[] {
  if (!Array.isArray(raw)) return []
  return raw
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const row = item as Record<string, unknown>
      if (
        typeof row.id !== 'string' ||
        typeof row.title !== 'string' ||
        typeof row.url !== 'string'
      ) {
        return []
      }
      const title = row.title.trim()
      const url = row.url.trim()
      if (!title || !isValidPersonalLinkUrl(url)) return []
      const order = typeof row.order === 'number' && Number.isFinite(row.order) ? row.order : 0
      return [{ id: row.id, title, url, order }]
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'es'))
}

function assertPersonalLinks(links: PersonalLink[]): void {
  if (links.length > MAX_PERSONAL_LINKS) {
    throw new Error(`Podés guardar hasta ${MAX_PERSONAL_LINKS} enlaces personales`)
  }
  const ids = new Set<string>()
  for (const link of links) {
    if (!link.title.trim()) throw new Error('Cada enlace necesita un título')
    if (!isValidPersonalLinkUrl(link.url)) {
      throw new Error('Cada enlace necesita una URL válida (http:// o https://)')
    }
    if (ids.has(link.id)) throw new Error('Hay enlaces duplicados')
    ids.add(link.id)
  }
}

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  department: UserDepartment
  role: UserRole
  /** Solo aplica si role === 'admin'. IDs de carpetas de primer nivel / áreas que gobierna. */
  managedAreaIds?: string[]
  /** Excepciones de gobernanza por acción y área (cualquier rol excepto super_admin). */
  actionGrants?: ActionGrants
  /** Áreas a las que pertenece (fan-out Drive, directorio interno). Cualquier rol. */
  memberAreaIds?: string[]
  /**
   * @deprecated Reemplazado por `role`. Se mantiene por compatibilidad.
   */
  permissions: UserPermissions
  favoriteApps: string[]
  /** Enlaces personales del usuario (Home), independientes del catálogo coreApps. */
  personalLinks: PersonalLink[]
  /** Widgets visibles en la tarjeta de bienvenida de la home. */
  widgetPreferences: HomeWidgetPreferences
  birthDate?: string
  accountType?: AccountType
  accountStatus?: AccountStatus
  accountStatusReason?: string
  accountReviewedAt?: string
  accountReviewedBy?: { uid: string; email: string }
}

/** @deprecated Preferir `role: 'user'`. Se mantiene por compatibilidad. */
export const DEFAULT_PERMISSIONS: UserPermissions = {
  view_directory: true,
  view_drive: true,
  view_links: true,
  manage_news: false,
  manage_links: false,
  manage_users: false,
  super_admin: false,
  rag_assistant: false,
  view_finanzas: false,
  manage_finanzas_caja: false,
}

export const SUPER_ADMIN_EMAILS = [
  'admin@bacarsa.com.ar',
  'sistemas.ti@bacarsa.com.ar',
] as const

/** @deprecated Preferir `role: 'super_admin'`. Se mantiene por compatibilidad. */
export const SUPER_ADMIN_PERMISSIONS: UserPermissions = {
  view_directory: true,
  view_drive: true,
  view_links: true,
  manage_news: true,
  manage_links: true,
  manage_users: true,
  super_admin: true,
  rag_assistant: true,
  view_finanzas: true,
  manage_finanzas_caja: true,
}

export const EXTERNAL_PENDING_PERMISSIONS: UserPermissions = {
  view_directory: false,
  view_drive: false,
  view_links: false,
  manage_news: false,
  manage_links: false,
  manage_users: false,
  super_admin: false,
  rag_assistant: false,
  view_finanzas: false,
}

export const EXTERNAL_APPROVED_PERMISSIONS: UserPermissions = {
  view_directory: true,
  view_drive: false,
  view_links: false,
  manage_news: false,
  manage_links: false,
  manage_users: false,
  super_admin: false,
  rag_assistant: false,
  view_finanzas: false,
}

export {
  isCorporateEmail,
  isExternalAccount,
  isAccountActive,
  isAccountPending,
  isAccountRejected,
} from '../utils/accountAccess'

const VALID_ROLES: readonly UserRole[] = ['super_admin', 'admin', 'user']

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  return SUPER_ADMIN_EMAILS.some((adminEmail) => adminEmail === normalized)
}

/** @deprecated Preferir `role` en el perfil. Sigue devolviendo flags booleanos. */
export function getPermissionsForEmail(email: string | null | undefined): UserPermissions {
  return isSuperAdminEmail(email) ? SUPER_ADMIN_PERMISSIONS : DEFAULT_PERMISSIONS
}

export function resolveRoleForEmail(email: string | null | undefined): UserRole {
  return isSuperAdminEmail(email) ? 'super_admin' : 'user'
}

function isValidRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (VALID_ROLES as readonly string[]).includes(value)
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

const GOVERNANCE_ACTIONS: readonly GovernanceAction[] = [
  'approval',
  'permission_grant',
  'classification_change',
  'authorized_copy',
]

function normalizeActionGrants(raw: unknown): ActionGrants {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const source = raw as Record<string, unknown>
  const out: ActionGrants = {}
  for (const action of GOVERNANCE_ACTIONS) {
    const ids = normalizeStringArray(source[action])
    if (ids.length > 0) out[action] = ids
  }
  return out
}

/** Deriva el role desde el documento (con fallback hasta que corra la migración). */
export function resolveRoleFromUserData(data: DocumentData): UserRole {
  if (isValidRole(data.role)) {
    return data.role
  }

  const email = typeof data.email === 'string' ? data.email : ''
  const permissions = data.permissions ?? {}

  if (isSuperAdminEmail(email) || permissions.super_admin === true) {
    return 'super_admin'
  }

  return 'user'
}

export function isSuperAdmin(profile: UserProfile | null | undefined): boolean {
  return profile?.role === 'super_admin'
}

export function hasRagAssistantAccess(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false
  if (isSuperAdmin(profile)) return true
  return profile.permissions.rag_assistant === true
}

/** Módulo Finanzas: super_admin siempre; resto con permiso explícito (alineado con requireViewFinanzas en API). */
export function hasFinanzasAccess(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false
  if (isSuperAdmin(profile) || profile.permissions.super_admin === true) return true
  return profile.permissions.view_finanzas === true
}

export function isAdminOfArea(
  profile: UserProfile | null | undefined,
  areaId: string,
): boolean {
  if (!profile || profile.role !== 'admin' || !areaId) return false
  return Array.isArray(profile.managedAreaIds) && profile.managedAreaIds.includes(areaId)
}

/** Miembro o admin del área indicada (`memberAreaIds` o `managedAreaIds`). */
export function userBelongsToGoverningArea(
  profile: UserProfile | null | undefined,
  areaId: string,
): boolean {
  if (!profile || !areaId) return false
  const memberIds = profile.memberAreaIds ?? []
  const managedIds = profile.managedAreaIds ?? []
  return memberIds.includes(areaId) || managedIds.includes(areaId)
}

export function isUser(profile: UserProfile | null | undefined): boolean {
  if (!profile) return true
  return profile.role === 'user'
}

function mapDocToUserProfile(uid: string, data: DocumentData): UserProfile {
  const permissions = data.permissions ?? {}
  const role = resolveRoleFromUserData(data)
  const accountType =
    data.accountType === 'external' || data.accountType === 'corporate'
      ? data.accountType
      : resolveAccountType(typeof data.email === 'string' ? data.email : '')
  const accountStatus = resolveAccountStatus(data.accountStatus)

  const profile: UserProfile = {
    uid,
    email: data.email ?? '',
    displayName: data.displayName ?? '',
    department: (data.department as UserDepartment) ?? 'General',
    role,
    accountType,
    accountStatus,
    permissions: {
      view_directory: permissions.view_directory ?? DEFAULT_PERMISSIONS.view_directory,
      view_drive: permissions.view_drive ?? DEFAULT_PERMISSIONS.view_drive,
      view_links: permissions.view_links ?? DEFAULT_PERMISSIONS.view_links,
      manage_news: permissions.manage_news ?? false,
      manage_links: permissions.manage_links ?? false,
      manage_users: permissions.manage_users ?? false,
      super_admin: permissions.super_admin ?? false,
      rag_assistant: permissions.rag_assistant ?? false,
      view_finanzas: permissions.view_finanzas ?? false,
    },
    favoriteApps: Array.isArray(data.favoriteApps)
      ? (data.favoriteApps as string[])
      : [],
    personalLinks: parsePersonalLinks(data.personalLinks),
    widgetPreferences: resolveHomeWidgetPreferences(
      data.widgetPreferences as Partial<HomeWidgetPreferences> | undefined,
    ),
    birthDate: typeof data.birthDate === 'string' ? data.birthDate : undefined,
  }

  if (typeof data.accountStatusReason === 'string' && data.accountStatusReason.trim()) {
    profile.accountStatusReason = data.accountStatusReason.trim()
  }
  if (data.accountReviewedBy && typeof data.accountReviewedBy === 'object') {
    const reviewedBy = data.accountReviewedBy as Record<string, unknown>
    if (
      typeof reviewedBy.uid === 'string' &&
      typeof reviewedBy.email === 'string'
    ) {
      profile.accountReviewedBy = {
        uid: reviewedBy.uid,
        email: reviewedBy.email,
      }
    }
  }
  if (data.accountReviewedAt?.toDate) {
    profile.accountReviewedAt = data.accountReviewedAt.toDate().toISOString()
  } else if (typeof data.accountReviewedAt === 'string') {
    profile.accountReviewedAt = data.accountReviewedAt
  }

  if (accountType === 'external') {
    profile.permissions =
      accountStatus === 'active'
        ? {
            ...EXTERNAL_APPROVED_PERMISSIONS,
            view_directory: permissions.view_directory === true,
            view_drive: false,
            view_links: false,
            super_admin: false,
            rag_assistant: false,
          }
        : { ...EXTERNAL_PENDING_PERMISSIONS }
  }

  if (role === 'admin' && Array.isArray(data.managedAreaIds)) {
    profile.managedAreaIds = (data.managedAreaIds as unknown[]).filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    )
  }

  if (Array.isArray(data.memberAreaIds)) {
    profile.memberAreaIds = (data.memberAreaIds as unknown[]).filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    )
  }

  const actionGrants = normalizeActionGrants(data.actionGrants)
  if (Object.keys(actionGrants).length > 0) {
    profile.actionGrants = actionGrants
  }

  return profile
}

export async function registerUser(
  email: string,
  password: string,
  name: string,
  department: UserDepartment,
  birthDate: string,
): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase()
  const corporate = isCorporateEmail(normalizedEmail)

  const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password)
  const { uid } = credential.user

  await updateProfile(credential.user, { displayName: name.trim() })

  await bootstrapUserProfileAfterAuth({
    source: 'register',
    displayName: name.trim(),
    department,
    birthDate,
  })

  if (corporate) {
    try {
      await applyPendingUserSetupAfterRegister()
    } catch (err) {
      console.error('No se pudo aplicar la configuración pendiente:', err)
    }
  }

  return uid
}

/**
 * Crea el perfil de Firestore solo si no existe.
 * Nunca actualiza `role` (ni otros campos) de un documento existente.
 */
export async function ensureGoogleUserProfile(user: User): Promise<boolean> {
  const snapshot = await getDoc(doc(db, USERS_COLLECTION, user.uid))
  if (snapshot.exists()) {
    return false
  }

  await bootstrapUserProfileAfterAuth({
    source: 'google',
    displayName: user.displayName?.trim() || user.email?.split('@')[0] || 'Usuario',
  })

  return true
}

/**
 * Sincroniza super admins designados vía backend (Admin SDK).
 * Reemplaza escrituras cliente que violaban las rules.
 */
export async function ensureSuperAdminPermissions(
  _uid: string,
  email: string | null | undefined,
): Promise<void> {
  if (!isSuperAdminEmail(email)) return
  await bootstrapUserProfileAfterAuth({ source: 'google' })
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(doc(db, USERS_COLLECTION, uid))

  if (!snapshot.exists()) {
    return null
  }

  return mapDocToUserProfile(uid, snapshot.data())
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const usersQuery = query(
    collection(db, USERS_COLLECTION),
    orderBy('displayName', 'asc'),
  )

  const snapshot = await getDocs(usersQuery)

  if (snapshot.empty) {
    return []
  }

  return snapshot.docs.map((document) =>
    mapDocToUserProfile(document.id, document.data()),
  )
}

export async function updateUserPermissions(
  uid: string,
  newPermissions: UserPermissions,
): Promise<void> {
  await updateDoc(doc(db, USERS_COLLECTION, uid), {
    permissions: newPermissions,
  })
}

export async function updateUserBasicInfo(
  uid: string,
  data: {
    displayName: string
    email: string
    department: UserDepartment
    birthDate?: string
  },
): Promise<void> {
  const payload: Record<string, string> = {
    displayName: data.displayName.trim(),
    email: data.email.trim(),
    department: data.department,
  }
  if (data.birthDate !== undefined) {
    payload.birthDate = data.birthDate
  }
  // Actualiza el documento en Firestore. Cambiar email/displayName en Firebase Auth
  // de otros usuarios requiere Admin SDK o una Cloud Function en producción.
  await updateDoc(doc(db, USERS_COLLECTION, uid), payload)
}

export async function toggleFavoriteApp(userId: string, appId: string): Promise<string[]> {
  const profile = await getUserProfile(userId)
  const current = profile?.favoriteApps ?? []
  const next = current.includes(appId)
    ? current.filter((id) => id !== appId)
    : [...current, appId]

  await updateDoc(doc(db, USERS_COLLECTION, userId), {
    favoriteApps: next,
  })

  return next
}

async function writePersonalLinks(userId: string, links: PersonalLink[]): Promise<PersonalLink[]> {
  const normalized = [...links]
    .map((link, index) => ({
      id: link.id,
      title: link.title.trim(),
      url: link.url.trim(),
      order: typeof link.order === 'number' ? link.order : index,
    }))
    .sort((a, b) => a.order - b.order)
    .map((link, index) => ({ ...link, order: index }))

  assertPersonalLinks(normalized)
  await updateDoc(doc(db, USERS_COLLECTION, userId), {
    personalLinks: normalized,
  })
  return normalized
}

export async function addPersonalLink(
  userId: string,
  input: { title: string; url: string },
): Promise<PersonalLink[]> {
  const profile = await getUserProfile(userId)
  const current = profile?.personalLinks ?? []
  if (current.length >= MAX_PERSONAL_LINKS) {
    throw new Error(`Podés guardar hasta ${MAX_PERSONAL_LINKS} enlaces personales`)
  }

  const title = input.title.trim()
  const url = input.url.trim()
  if (!title) throw new Error('El título es obligatorio')
  if (!isValidPersonalLinkUrl(url)) {
    throw new Error('La URL debe empezar con http:// o https://')
  }

  const nextOrder =
    current.length === 0 ? 0 : Math.max(...current.map((link) => link.order), -1) + 1

  const next: PersonalLink[] = [
    ...current,
    {
      id: crypto.randomUUID(),
      title,
      url,
      order: nextOrder,
    },
  ]

  return writePersonalLinks(userId, next)
}

export async function removePersonalLink(userId: string, linkId: string): Promise<PersonalLink[]> {
  const profile = await getUserProfile(userId)
  const current = profile?.personalLinks ?? []
  const next = current.filter((link) => link.id !== linkId)
  if (next.length === current.length) {
    throw new Error('Enlace no encontrado')
  }
  return writePersonalLinks(userId, next)
}

export async function reorderPersonalLinks(
  userId: string,
  orderedIds: string[],
): Promise<PersonalLink[]> {
  const profile = await getUserProfile(userId)
  const current = profile?.personalLinks ?? []
  if (orderedIds.length !== current.length) {
    throw new Error('La lista de orden no coincide con tus enlaces')
  }

  const byId = new Map(current.map((link) => [link.id, link]))
  const next = orderedIds.map((id, index) => {
    const link = byId.get(id)
    if (!link) throw new Error('Enlace no encontrado')
    return { ...link, order: index }
  })

  return writePersonalLinks(userId, next)
}

export async function updateHomeWidgetPreferences(
  userId: string,
  patch: Partial<HomeWidgetPreferences>,
): Promise<HomeWidgetPreferences> {
  const profile = await getUserProfile(userId)
  const current = profile?.widgetPreferences ?? resolveHomeWidgetPreferences(undefined)
  const next: HomeWidgetPreferences = { ...current, ...patch }

  await updateDoc(doc(db, USERS_COLLECTION, userId), {
    widgetPreferences: next,
  })

  return next
}

export type { HomeWidgetId, HomeWidgetPreferences }

/**
 * Elimina el perfil de Firestore.
 *
 * NOTA: La cuenta en Firebase Authentication NO se elimina desde el SDK del cliente.
 * En producción, usá una Cloud Function con Admin SDK o eliminá el usuario manualmente
 * en Firebase Console → Authentication.
 */
export async function deleteUser(uid: string): Promise<void> {
  await deleteDoc(doc(db, USERS_COLLECTION, uid))
}

export function canManageUsers(permissions: UserPermissions | undefined): boolean {
  return !!(permissions?.super_admin || permissions?.manage_users)
}

export function canManageDirectory(
  email: string | null | undefined,
  permissions?: UserPermissions,
): boolean {
  return isSuperAdminEmail(email) || permissions?.super_admin === true
}

/** Turnos: solo los dos perfiles administradores (sistemas.ti y admin). */
export function canManageShifts(email: string | null | undefined): boolean {
  return isSuperAdminEmail(email)
}

/**
 * Actualiza role a 'admin' | 'user'. Nunca permite 'super_admin' (solo Firestore Console).
 */
export async function updateUserRole(
  uid: string,
  role: 'admin' | 'user',
): Promise<void> {
  if (role !== 'admin' && role !== 'user') {
    throw new Error('updateUserRole solo acepta "admin" o "user"')
  }

  const snapshot = await getDoc(doc(db, USERS_COLLECTION, uid))
  if (!snapshot.exists()) {
    throw new Error('Usuario no encontrado')
  }

  const beforeRole = snapshot.data().role as UserRole | undefined
  const targetName =
    (typeof snapshot.data().displayName === 'string' && snapshot.data().displayName) ||
    (typeof snapshot.data().email === 'string' && snapshot.data().email) ||
    uid

  const patch: Record<string, unknown> = { role }

  await updateDoc(doc(db, USERS_COLLECTION, uid), patch)

  await logAction({
    action: 'role_change',
    targetType: 'user',
    targetId: uid,
    targetName,
    metadata: { antes: beforeRole ?? null, despues: role },
  })
}

/**
 * Actualiza managedAreaIds vía backend (solo super_admin, motivo obligatorio).
 */
export async function updateManagedAreaIds(
  uid: string,
  areaIds: string[],
  reason: string,
): Promise<void> {
  const cleaned = areaIds
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)

  await patchUserManagedAreas(uid, cleaned, reason.trim())
}

/**
 * Actualiza memberAreaIds vía backend (solo super_admin, motivo obligatorio).
 */
export async function updateMemberAreaIds(
  uid: string,
  areaIds: string[],
  reason: string,
): Promise<void> {
  const cleaned = areaIds
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)

  await patchUserMemberAreas(uid, cleaned, reason.trim())
}
