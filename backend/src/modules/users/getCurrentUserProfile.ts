import type { Request, Response } from 'express'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import { resolveRoleForEmail, SUPER_ADMIN_PERMISSIONS } from './profileDefaults.js'

/** Perfil del usuario autenticado desde Firestore Admin (misma DB que staging/emulador). */
export async function getCurrentUserProfile(req: Request, res: Response): Promise<void> {
  const auth = req.authBootstrap
  if (!auth) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  try {
    const snap = await adminDb().collection('users').doc(auth.uid).get()
    if (!snap.exists) {
      res.status(404).json({ error: 'Perfil no encontrado' })
      return
    }

    const data = snap.data() ?? {}
    const permissionsRaw =
      data.permissions && typeof data.permissions === 'object' && !Array.isArray(data.permissions)
        ? (data.permissions as Record<string, unknown>)
        : {}

    const roleFromDoc = typeof data.role === 'string' ? data.role : null
    const role =
      roleFromDoc === 'super_admin' || roleFromDoc === 'admin' || roleFromDoc === 'user'
        ? roleFromDoc
        : resolveRoleForEmail(auth.email)

    res.json({
      uid: auth.uid,
      email: typeof data.email === 'string' ? data.email : auth.email,
      displayName:
        (typeof data.displayName === 'string' && data.displayName.trim()) ||
        auth.displayName ||
        auth.email.split('@')[0],
      department: typeof data.department === 'string' ? data.department : 'General',
      role,
      accountType: data.accountType === 'external' ? 'external' : 'corporate',
      accountStatus:
        data.accountStatus === 'pending' ||
        data.accountStatus === 'rejected' ||
        data.accountStatus === 'active'
          ? data.accountStatus
          : 'active',
      permissions:
        role === 'super_admin' || permissionsRaw.super_admin === true
          ? { ...SUPER_ADMIN_PERMISSIONS }
          : {
              view_directory: permissionsRaw.view_directory === true,
              view_drive: permissionsRaw.view_drive === true,
              view_links: permissionsRaw.view_links === true,
              manage_news: permissionsRaw.manage_news === true,
              manage_links: permissionsRaw.manage_links === true,
              manage_users: permissionsRaw.manage_users === true,
              super_admin: permissionsRaw.super_admin === true,
              rag_assistant: permissionsRaw.rag_assistant === true,
              view_finanzas: permissionsRaw.view_finanzas === true,
              finanzas_agenda: permissionsRaw.finanzas_agenda === true,
              finanzas_cheques: permissionsRaw.finanzas_cheques === true,
              finanzas_categorias: permissionsRaw.finanzas_categorias === true,
              finanzas_transferencias: permissionsRaw.finanzas_transferencias === true,
              finanzas_destinatarios: permissionsRaw.finanzas_destinatarios === true,
              finanzas_saldos: permissionsRaw.finanzas_saldos === true,
              manage_finanzas_caja: permissionsRaw.manage_finanzas_caja === true,
              rrhh_detalle: permissionsRaw.rrhh_detalle === true,
            },
      managedAreaIds: Array.isArray(data.managedAreaIds)
        ? data.managedAreaIds.filter((id): id is string => typeof id === 'string')
        : [],
      memberAreaIds: Array.isArray(data.memberAreaIds)
        ? data.memberAreaIds.filter((id): id is string => typeof id === 'string')
        : [],
      favoriteApps: Array.isArray(data.favoriteApps)
        ? data.favoriteApps.filter((id): id is string => typeof id === 'string')
        : [],
      personalLinks: Array.isArray(data.personalLinks) ? data.personalLinks : [],
      widgetPreferences:
        data.widgetPreferences && typeof data.widgetPreferences === 'object'
          ? data.widgetPreferences
          : { weather: true, dollar: true },
      birthDate: typeof data.birthDate === 'string' ? data.birthDate : undefined,
    })
  } catch (err) {
    logError('getCurrentUserProfile falló', err)
    res.status(500).json({ error: 'No se pudo cargar el perfil' })
  }
}
