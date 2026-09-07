import type { NextFunction, Request, Response } from 'express'
import { getEnv, isEmailInAllowedDomain } from '../../config/env.js'
import { adminAuth, adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import { normalizeActionGrants, type ActionGrants } from '../drive/governanceActions.js'

export interface AuthedUserPermissions {
  super_admin?: boolean
  view_drive?: boolean
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
    const permissionsRaw = profile.get('permissions')
    const permissions: AuthedUserPermissions =
      permissionsRaw && typeof permissionsRaw === 'object' && !Array.isArray(permissionsRaw)
        ? {
            super_admin:
              (permissionsRaw as Record<string, unknown>).super_admin === true,
            view_drive: (permissionsRaw as Record<string, unknown>).view_drive === true,
          }
        : {}
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
