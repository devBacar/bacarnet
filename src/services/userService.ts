import { createUserWithEmailAndPassword, updateProfile, type User } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore'
import { auth, db } from './firebase'
import { logAction } from './auditLogService'
import { applyPendingUserSetupAfterRegister, patchUserManagedAreas, patchUserMemberAreas } from './usersApi'
import {
  resolveHomeWidgetPreferences,
  type HomeWidgetId,
  type HomeWidgetPreferences,
} from '../constants/homeWidgets'

const USERS_COLLECTION = 'users'

export type UserDepartment = string

export type UserRole = 'super_admin' | 'admin' | 'user'

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
  /** Widgets visibles en la tarjeta de bienvenida de la home. */
  widgetPreferences: HomeWidgetPreferences
  birthDate?: string
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
}

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

export function isAdminOfArea(
  profile: UserProfile | null | undefined,
  areaId: string,
): boolean {
  if (!profile || profile.role !== 'admin' || !areaId) return false
  return Array.isArray(profile.managedAreaIds) && profile.managedAreaIds.includes(areaId)
}

export function isUser(profile: UserProfile | null | undefined): boolean {
  if (!profile) return true
  return profile.role === 'user'
}

function mapDocToUserProfile(uid: string, data: DocumentData): UserProfile {
  const permissions = data.permissions ?? {}
  const role = resolveRoleFromUserData(data)

  const profile: UserProfile = {
    uid,
    email: data.email ?? '',
    displayName: data.displayName ?? '',
    department: (data.department as UserDepartment) ?? 'General',
    role,
    permissions: {
      view_directory: permissions.view_directory ?? DEFAULT_PERMISSIONS.view_directory,
      view_drive: permissions.view_drive ?? DEFAULT_PERMISSIONS.view_drive,
      view_links: permissions.view_links ?? DEFAULT_PERMISSIONS.view_links,
      manage_news: permissions.manage_news ?? false,
      manage_links: permissions.manage_links ?? false,
      manage_users: permissions.manage_users ?? false,
      super_admin: permissions.super_admin ?? false,
    },
    favoriteApps: Array.isArray(data.favoriteApps)
      ? (data.favoriteApps as string[])
      : [],
    widgetPreferences: resolveHomeWidgetPreferences(
      data.widgetPreferences as Partial<HomeWidgetPreferences> | undefined,
    ),
    birthDate: typeof data.birthDate === 'string' ? data.birthDate : undefined,
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
  const credential = await createUserWithEmailAndPassword(auth, email, password)
  const { uid } = credential.user

  await updateProfile(credential.user, { displayName: name.trim() })

  await setDoc(doc(db, USERS_COLLECTION, uid), {
    email,
    displayName: name.trim(),
    department,
    birthDate,
    role: resolveRoleForEmail(email),
    permissions: getPermissionsForEmail(email),
    favoriteApps: [],
  })

  try {
    await applyPendingUserSetupAfterRegister()
  } catch (err) {
    console.error('No se pudo aplicar la configuración pendiente:', err)
  }

  return uid
}

/**
 * Crea el perfil de Firestore solo si no existe.
 * Nunca actualiza `role` (ni otros campos) de un documento existente.
 */
export async function ensureGoogleUserProfile(user: User): Promise<boolean> {
  const userRef = doc(db, USERS_COLLECTION, user.uid)
  const snapshot = await getDoc(userRef)

  if (snapshot.exists()) {
    return false
  }

  await setDoc(userRef, {
    email: user.email ?? '',
    displayName:
      user.displayName?.trim() ||
      user.email?.split('@')[0] ||
      'Usuario',
    department: 'General',
    role: resolveRoleForEmail(user.email),
    permissions: getPermissionsForEmail(user.email),
    favoriteApps: [],
  })

  return true
}

/**
 * Solo para emails en SUPER_ADMIN_EMAILS.
 * Puede setear `role: 'super_admin'` si falta; no toca ni degrada `admin` / `user`.
 */
export async function ensureSuperAdminPermissions(
  uid: string,
  email: string | null | undefined,
): Promise<void> {
  if (!isSuperAdminEmail(email)) return

  const userRef = doc(db, USERS_COLLECTION, uid)
  const snapshot = await getDoc(userRef)

  if (!snapshot.exists()) return

  const data = snapshot.data()
  const current = data.permissions ?? {}
  const needsPermissionUpdate =
    current.super_admin !== true ||
    current.manage_users !== true ||
    current.manage_news !== true ||
    current.manage_links !== true
  const needsRoleUpdate = data.role !== 'super_admin'

  if (!needsPermissionUpdate && !needsRoleUpdate) return

  const patch: Record<string, unknown> = {}
  if (needsPermissionUpdate) {
    patch.permissions = SUPER_ADMIN_PERMISSIONS
  }
  if (needsRoleUpdate) {
    patch.role = 'super_admin'
  }

  await updateDoc(userRef, patch)
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
  },
): Promise<void> {
  // Actualiza el documento en Firestore. Cambiar email/displayName en Firebase Auth
  // de otros usuarios requiere Admin SDK o una Cloud Function en producción.
  await updateDoc(doc(db, USERS_COLLECTION, uid), {
    displayName: data.displayName.trim(),
    email: data.email.trim(),
    department: data.department,
  })
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
