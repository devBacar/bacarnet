import type { Request, Response } from 'express'
import { getAuth } from 'firebase-admin/auth'
import { generateTemporaryPassword } from '../../lib/generateTemporaryPassword.js'
import { logError } from '../../lib/log.js'
import { writeAuditLogBestEffort } from '../audit/writeAuditLog.js'
import { getMinReasonLength } from '../drive/policy.js'
import { loadTargetUser, parseReason } from './userGovernanceShared.js'

export async function resetUserPassword(req: Request, res: Response): Promise<void> {
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

  if (uid === actor.uid) {
    res.status(409).json({ error: 'No podés restablecer tu propia contraseña desde acá' })
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

  const target = await loadTargetUser(uid)
  if (!target) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }

  let authUser
  try {
    authUser = await getAuth().getUser(uid)
  } catch {
    res.status(404).json({ error: 'El usuario no tiene cuenta en Firebase Auth' })
    return
  }

  const email = authUser.email?.trim().toLowerCase() ?? ''
  if (!email) {
    res.status(409).json({ error: 'El usuario no tiene email en Firebase Auth' })
    return
  }

  const temporaryPassword = generateTemporaryPassword()

  try {
    await getAuth().updateUser(uid, {
      password: temporaryPassword,
      emailVerified: true,
    })
  } catch (err) {
    logError('resetUserPassword: falló updateUser', err)
    res.status(502).json({ error: 'No se pudo restablecer la contraseña' })
    return
  }

  await writeAuditLogBestEffort({
    userId: actor.uid,
    userEmail: actor.email,
    action: 'password_reset',
    targetType: 'user',
    targetId: uid,
    targetName: target.targetName,
    parentFolderId: null,
    mimeType: null,
    reason,
    metadata: { targetEmail: email },
  })

  res.json({
    uid,
    email,
    temporaryPassword,
  })
}
