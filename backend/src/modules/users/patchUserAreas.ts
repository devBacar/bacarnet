import type { Request, Response } from 'express'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import { writeAuditLogBestEffort } from '../audit/writeAuditLog.js'
import { getMinReasonLength } from '../drive/policy.js'
import { normalizeStringArray } from '../drive/governanceActions.js'
import {
  loadTargetUser,
  parseReason,
  USERS_COLLECTION,
  validateAssignableAreaIds,
} from './userGovernanceShared.js'

/** PATCH /api/users/:uid/managed-areas — reemplazo completo (super_admin). */
export async function patchUserManagedAreas(req: Request, res: Response): Promise<void> {
  const actor = req.authedUser
  if (!actor) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const uid = String(req.params.uid ?? '').trim()
  if (!uid) {
    res.status(400).json({ error: 'uid inválido' })
    return
  }

  const body = req.body as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Body inválido' })
    return
  }

  const minReason = await getMinReasonLength()
  const reason = parseReason(body, minReason)
  if (!reason) {
    res.status(400).json({ error: `reason debe tener al menos ${minReason} caracteres` })
    return
  }

  if (!Array.isArray(body.areaIds)) {
    res.status(400).json({ error: 'areaIds debe ser un array' })
    return
  }

  const target = await loadTargetUser(uid)
  if (!target) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }

  if (target.role !== 'admin') {
    res.status(409).json({
      error: 'managedAreaIds solo aplica a usuarios con role "admin"',
    })
    return
  }

  let cleaned: string[]
  try {
    cleaned = await validateAssignableAreaIds(normalizeStringArray(body.areaIds))
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'areaIds inválidos',
    })
    return
  }

  const before = target.managedAreaIds

  try {
    await adminDb().collection(USERS_COLLECTION).doc(uid).update({
      managedAreaIds: cleaned,
    })
  } catch (err) {
    logError('patchUserManagedAreas: fallo al actualizar Firestore', err)
    res.status(500).json({ error: 'No se pudieron actualizar las áreas administradas' })
    return
  }

  await writeAuditLogBestEffort({
    userId: actor.uid,
    userEmail: actor.email,
    action: 'managed_areas_change',
    targetType: 'user',
    targetId: uid,
    targetName: target.targetName,
    parentFolderId: null,
    mimeType: null,
    reason,
    metadata: { antes: before, despues: cleaned },
  })

  res.json({ uid, managedAreaIds: cleaned })
}

/** PATCH /api/users/:uid/member-areas — reemplazo completo (super_admin). */
export async function patchUserMemberAreas(req: Request, res: Response): Promise<void> {
  const actor = req.authedUser
  if (!actor) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const uid = String(req.params.uid ?? '').trim()
  if (!uid) {
    res.status(400).json({ error: 'uid inválido' })
    return
  }

  const body = req.body as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Body inválido' })
    return
  }

  const minReason = await getMinReasonLength()
  const reason = parseReason(body, minReason)
  if (!reason) {
    res.status(400).json({ error: `reason debe tener al menos ${minReason} caracteres` })
    return
  }

  if (!Array.isArray(body.areaIds)) {
    res.status(400).json({ error: 'areaIds debe ser un array' })
    return
  }

  const target = await loadTargetUser(uid)
  if (!target) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }

  if (target.role === 'super_admin') {
    res.status(409).json({ error: 'No se editan áreas de pertenencia de super_admin' })
    return
  }

  let cleaned: string[]
  try {
    cleaned = await validateAssignableAreaIds(normalizeStringArray(body.areaIds))
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'areaIds inválidos',
    })
    return
  }

  const before = target.memberAreaIds

  try {
    await adminDb().collection(USERS_COLLECTION).doc(uid).update({
      memberAreaIds: cleaned,
    })
  } catch (err) {
    logError('patchUserMemberAreas: fallo al actualizar Firestore', err)
    res.status(500).json({ error: 'No se pudieron actualizar las áreas de pertenencia' })
    return
  }

  await writeAuditLogBestEffort({
    userId: actor.uid,
    userEmail: actor.email,
    action: 'member_areas_change',
    targetType: 'user',
    targetId: uid,
    targetName: target.targetName,
    parentFolderId: null,
    mimeType: null,
    reason,
    metadata: { antes: before, despues: cleaned },
  })

  res.json({ uid, memberAreaIds: cleaned })
}
