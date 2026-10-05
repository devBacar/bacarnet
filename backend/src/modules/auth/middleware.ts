import type { NextFunction, Request, Response } from 'express'
import { getEnv, isEmailInAllowedDomain } from '../../config/env.js'
import { adminAuth, adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import { normalizeActionGrants, type ActionGrants } from '../drive/governanceActions.js'

export interface AuthedUserPermissions {
  super_admin?: boolean
  view_drive?: boolean
  /** Ver todas las pantallas de Finanzas. */
  view_finanzas?: boolean
  /** Cargar, editar, pagar y reprogramar compromisos y cobros. */
  finanzas_agenda?: boolean
  /** Importar, ingresar y cambiar el estado de cheques. */
  finanzas_cheques?: boolean
  /** Categorías, reglas y anotaciones de movimientos. */
  finanzas_categorias?: boolean
  /** Confeccionar, cancelar y confirmar el movimiento de una transferencia. */
  finanzas_transferencias?: boolean
  /** Alta, edición y baja de destinatarios. */
  finanzas_destinatarios?: boolean
  /** Descubierto, saldo manual, reinicio USD e historial de posición. */
  finanzas_saldos?: boolean
  /** Líder de caja chica: crear cajas, reasignar responsable, aprobar rendiciones. */
  manage_finanzas_caja?: boolean
  manage_users?: boolean
  rag_assistant?: boolean
}

export type FinanzasPermisoClave =
  | 'finanzas_agenda'
  | 'finanzas_cheques'
  | 'finanzas_categorias'
  | 'finanzas_transferencias'
  | 'finanzas_destinatarios'
  | 'finanzas_saldos'

export const MENSAJE_FINANZAS_PERMISO: Record<FinanzasPermisoClave, string> = {
  finanzas_agenda:
    'No tenés permiso para cargar o pagar compromisos y cobros. Pedíselo a quien administra los usuarios.',
  finanzas_cheques:
    'No tenés permiso para cargar o cambiar cheques. Pedíselo a quien administra los usuarios.',
  finanzas_categorias:
    'No tenés permiso para administrar categorías y reglas. Pedíselo a quien administra los usuarios.',
  finanzas_transferencias:
    'No tenés permiso para armar transferencias. Pedíselo a quien administra los usuarios.',
  finanzas_destinatarios:
    'No tenés permiso para administrar destinatarios. Pedíselo a quien administra los usuarios.',
  finanzas_saldos:
    'No tenés permiso para cambiar saldos y descubiertos. Pedíselo a quien administra los usuarios.',
}

function permisoVerdadero(raw: Record<string, unknown>, clave: string): boolean {
  return raw[clave] === true
}

export function permisosDesdePerfil(permissionsRaw: unknown): AuthedUserPermissions {
  if (!permissionsRaw || typeof permissionsRaw !== 'object' || Array.isArray(permissionsRaw)) {
    return {}
  }
  const raw = permissionsRaw as Record<string, unknown>
  return {
    super_admin: permisoVerdadero(raw, 'super_admin'),
    view_drive: permisoVerdadero(raw, 'view_drive'),
    view_finanzas: permisoVerdadero(raw, 'view_finanzas'),
    finanzas_agenda: permisoVerdadero(raw, 'finanzas_agenda'),
    finanzas_cheques: permisoVerdadero(raw, 'finanzas_cheques'),
    finanzas_categorias: permisoVerdadero(raw, 'finanzas_categorias'),
    finanzas_transferencias: permisoVerdadero(raw, 'finanzas_transferencias'),
    finanzas_destinatarios: permisoVerdadero(raw, 'finanzas_destinatarios'),
    finanzas_saldos: permisoVerdadero(raw, 'finanzas_saldos'),
    manage_finanzas_caja: permisoVerdadero(raw, 'manage_finanzas_caja'),
    manage_users: permisoVerdadero(raw, 'manage_users'),
    rag_assistant: permisoVerdadero(raw, 'rag_assistant'),
  }
}

export interface AuthedUser {
  uid: string
  email: string
  displayName: string
  role?: string
  managedAreaIds: string[]
  actionGrants: ActionGrants
  permissions: AuthedUserPermissions
}

export function isSuperAdminUser(user: Pick<AuthedUser, 'role' | 'permissions'>): boolean {
  return user.role === 'super_admin' || user.permissions.super_admin === true
}

export function canManageWorkspaceUsers(user: AuthedUser): boolean {
  return isSuperAdminUser(user) || user.permissions.manage_users === true
}

export interface AuthBootstrapContext {
  uid: string
  email: string
  displayName: string
  emailVerified: boolean
}

declare global {
  namespace Express {
    interface Request {
      authedUser?: AuthedUser
      authBootstrap?: AuthBootstrapContext
    }
  }
}

/** Verifica ID token sin exigir dominio corporativo ni perfil Firestore (bootstrap de perfil). */
export async function requireAuthBootstrap(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const token = header.slice('Bearer '.length).trim()
  if (!token) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const email = (decoded.email ?? '').trim().toLowerCase()
    if (!email) {
      res.status(403).json({ error: 'El token no incluye email' })
      return
    }

    req.authBootstrap = {
      uid: decoded.uid,
      email,
      displayName: typeof decoded.name === 'string' ? decoded.name.trim() : '',
      emailVerified: decoded.email_verified === true,
    }
    next()
  } catch (err) {
    logError('Fallo al verificar ID token (bootstrap)', err)
    res.status(401).json({ error: 'Token inválido' })
  }
}

export async function requireWorkspaceUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const token = header.slice('Bearer '.length).trim()
  if (!token) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const email = (decoded.email ?? '').trim().toLowerCase()
    const domain = getEnv().allowedEmailDomain

    if (!decoded.email_verified) {
      res.status(403).json({ error: 'El email no está verificado' })
      return
    }
    if (!email || !isEmailInAllowedDomain(email, domain)) {
      res.status(403).json({ error: `Solo se permite el dominio @${domain}` })
      return
    }

    const profile = await adminDb().collection('users').doc(decoded.uid).get()
    if (!profile.exists) {
      res.status(403).json({ error: 'Usuario no habilitado en la intranet' })
      return
    }

    const role = profile.get('role')
    const permissions = permisosDesdePerfil(profile.get('permissions'))
    const managedRaw = profile.get('managedAreaIds')
    const managedAreaIds = Array.isArray(managedRaw)
      ? managedRaw.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []
    req.authedUser = {
      uid: decoded.uid,
      email,
      displayName:
        (typeof profile.get('displayName') === 'string' && profile.get('displayName').trim()) ||
        (typeof decoded.name === 'string' && decoded.name.trim()) ||
        email,
      role: typeof role === 'string' ? role : undefined,
      managedAreaIds,
      actionGrants: normalizeActionGrants(profile.get('actionGrants')),
      permissions,
    }
    next()
  } catch (err) {
    logError('Fallo al verificar ID token', err)
    res.status(401).json({ error: 'Token inválido' })
  }
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.authedUser || !isSuperAdminUser(req.authedUser)) {
    res.status(403).json({ error: 'Se requiere rol super_admin' })
    return
  }
  next()
}

/**
 * Cuenta autenticada con perfil activo en Firestore. No exige dominio corporativo.
 * Pieza liviana para endpoints futuros orientados a cuentas externas aprobadas.
 */
export async function requireActiveAccount(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const token = header.slice('Bearer '.length).trim()
  if (!token) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  try {
    const decoded = await adminAuth().verifyIdToken(token)
    const email = (decoded.email ?? '').trim().toLowerCase()
    if (!decoded.email_verified) {
      res.status(403).json({ error: 'El email no está verificado' })
      return
    }

    const profile = await adminDb().collection('users').doc(decoded.uid).get()
    if (!profile.exists) {
      res.status(403).json({ error: 'Usuario no habilitado en la intranet' })
      return
    }

    const accountStatus = profile.get('accountStatus')
    if (accountStatus === 'pending_approval') {
      res.status(403).json({ error: 'Cuenta pendiente de aprobación' })
      return
    }
    if (accountStatus === 'rejected') {
      res.status(403).json({ error: 'Cuenta rechazada' })
      return
    }

    req.authedUser = {
      uid: decoded.uid,
      email,
      displayName:
        (typeof profile.get('displayName') === 'string' && profile.get('displayName').trim()) ||
        (typeof decoded.name === 'string' && decoded.name.trim()) ||
        email,
      role: typeof profile.get('role') === 'string' ? profile.get('role') : undefined,
      managedAreaIds: [],
      actionGrants: normalizeActionGrants(profile.get('actionGrants')),
      permissions: {},
    }
    next()
  } catch (err) {
    logError('Fallo al verificar cuenta activa', err)
    res.status(401).json({ error: 'Token inválido' })
  }
}

async function isResourcesModuleEnabled(): Promise<boolean> {
  const snap = await adminDb().collection('global_settings').doc('main').get()
  if (!snap.exists) return true
  return snap.get('resourcesEnabled') !== false
}

async function isFinanzasModuleEnabled(): Promise<boolean> {
  const snap = await adminDb().collection('global_settings').doc('main').get()
  if (!snap.exists) return false
  return snap.get('finanzasEnabled') === true
}

/** Mismo criterio que ModulePermissionRoute(view_finanzas, finanzasEnabled) en el frontend. */
export async function requireViewFinanzas(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  if (isSuperAdminUser(user)) {
    next()
    return
  }

  try {
    const moduleEnabled = await isFinanzasModuleEnabled()
    if (!moduleEnabled || user.permissions.view_finanzas !== true) {
      res.status(403).json({ error: 'No tenés permiso para acceder a Finanzas' })
      return
    }
    next()
  } catch (err) {
    logError('Fallo al verificar permiso view_finanzas', err)
    res.status(500).json({ error: 'No se pudo verificar el acceso a Finanzas' })
  }
}

/**
 * Acción de Finanzas: super admin pasa.
 * El resto necesita el módulo habilitado, view_finanzas y la clave.
 * Un líder de cajas sin view_finanzas no entra por acá: sigue solo en Cajas.
 */
export function requireFinanzasPermiso(clave: FinanzasPermisoClave) {
  return async function requireFinanzasPermisoMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const user = req.authedUser
    if (!user) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    if (isSuperAdminUser(user)) {
      next()
      return
    }

    try {
      const moduleEnabled = await isFinanzasModuleEnabled()
      if (!moduleEnabled) {
        res.status(403).json({ error: 'Finanzas no está habilitado' })
        return
      }
      if (user.permissions.view_finanzas !== true || user.permissions[clave] !== true) {
        res.status(403).json({ error: MENSAJE_FINANZAS_PERMISO[clave] })
        return
      }
      next()
    } catch (err) {
      logError(`Fallo al verificar permiso ${clave}`, err)
      res.status(500).json({ error: 'No se pudo verificar el permiso' })
    }
  }
}

/** Caja chica: líder, view_finanzas o responsable de al menos una caja. */
export async function requireFinanzasCajaModule(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  if (isSuperAdminUser(user)) {
    next()
    return
  }

  try {
    const moduleEnabled = await isFinanzasModuleEnabled()
    if (!moduleEnabled) {
      res.status(403).json({ error: 'Finanzas no está habilitado' })
      return
    }

    const { assertCajaChicaModuleAccess } = await import(
      '../finanzas/cajachica/services/caja.service.js'
    )
    const ok = await assertCajaChicaModuleAccess(user)
    if (!ok) {
      res.status(403).json({ error: 'No tenés acceso a Cajas' })
      return
    }
    next()
  } catch (err) {
    logError('Fallo al verificar acceso caja chica', err)
    res.status(500).json({ error: 'No se pudo verificar el acceso' })
  }
}

/** Mismo criterio que ModulePermissionRoute(view_drive, resourcesEnabled) en el frontend. */
export async function requireViewDrive(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  if (isSuperAdminUser(user)) {
    next()
    return
  }

  try {
    const moduleEnabled = await isResourcesModuleEnabled()
    if (!moduleEnabled || user.permissions.view_drive !== true) {
      res.status(403).json({ error: 'No tenés permiso para acceder a Archivos' })
      return
    }
    next()
  } catch (err) {
    logError('Fallo al verificar permiso view_drive', err)
    res.status(500).json({ error: 'No se pudo verificar el acceso a Archivos' })
  }
}
