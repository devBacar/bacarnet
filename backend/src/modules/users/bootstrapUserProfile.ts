import { FieldValue } from 'firebase-admin/firestore'
import type { Request, Response } from 'express'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import {
  buildNewUserProfile,
  SUPER_ADMIN_EMAILS,
  SUPER_ADMIN_PERMISSIONS,
  type BootstrapSource,
} from './profileDefaults.js'

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function syncDesignatedSuperAdmin(uid: string, email: string): Promise<boolean> {
  const normalized = normalizeEmail(email)
  if (!SUPER_ADMIN_EMAILS.has(normalized)) return false

  const ref = adminDb().collection('users').doc(uid)
  const snap = await ref.get()
  if (!snap.exists) return false

  const role = snap.get('role')
  const permissions = snap.get('permissions')
  const currentSuper =
    role === 'super_admin' ||
    (permissions &&
      typeof permissions === 'object' &&
      !Array.isArray(permissions) &&
      (permissions as Record<string, unknown>).super_admin === true)

  if (currentSuper && role === 'super_admin') return false

  await ref.update({
    role: 'super_admin',
    permissions: { ...SUPER_ADMIN_PERMISSIONS },
  })
  return true
}

function parseSource(value: unknown): BootstrapSource {
  return value === 'register' ? 'register' : 'google'
}

/**
 * Crea users/{uid} vía Admin SDK (idempotente). Sincroniza super admins designados.
 */
export async function bootstrapUserProfile(req: Request, res: Response): Promise<void> {
  const auth = req.authBootstrap
  if (!auth) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const body = req.body as Record<string, unknown> | null
  const source = parseSource(body?.source)
  const displayNameFromBody =
    typeof body?.displayName === 'string' ? body.displayName.trim() : ''
  const departmentFromBody =
    typeof body?.department === 'string' ? body.department.trim() : ''
  const birthDateFromBody =
    typeof body?.birthDate === 'string' ? body.birthDate.trim() : undefined

  const displayName =
    displayNameFromBody ||
    auth.displayName.trim() ||
    auth.email.split('@')[0] ||
    'Usuario'

  try {
    const ref = adminDb().collection('users').doc(auth.uid)
    const existing = await ref.get()

    if (existing.exists) {
      const synced = await syncDesignatedSuperAdmin(auth.uid, auth.email)
      res.json({ created: false, syncedSuperAdmin: synced })
      return
    }

    if (source === 'register') {
      if (!displayNameFromBody) {
        res.status(400).json({ error: 'displayName es obligatorio para registro' })
        return
      }
      if (!departmentFromBody) {
        res.status(400).json({ error: 'department es obligatorio para registro' })
        return
      }
      if (!birthDateFromBody) {
        res.status(400).json({ error: 'birthDate es obligatorio para registro' })
        return
      }
    }

    const profile = buildNewUserProfile({
      email: auth.email,
      displayName,
      department: source === 'register' ? departmentFromBody : 'General',
      birthDate: birthDateFromBody,
      source,
    })

    await ref.set({
      ...profile,
      createdAt: FieldValue.serverTimestamp(),
    })

    res.status(201).json({ created: true, syncedSuperAdmin: false })
  } catch (err) {
    logError('bootstrapUserProfile falló', err)
    res.status(500).json({ error: 'No se pudo crear el perfil de usuario' })
  }
}
