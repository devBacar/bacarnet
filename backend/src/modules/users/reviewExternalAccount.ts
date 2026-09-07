import { FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import type { Request, Response } from 'express'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import { writeAuditLogBestEffort, type AuditLogEntry } from '../audit/writeAuditLog.js'
import { getMinReasonLength } from '../drive/policy.js'
import { loadTargetUser, parseReason } from './userGovernanceShared.js'

const EXTERNAL_APPROVED_PERMISSIONS = {
  view_directory: true,
  view_drive: false,
  view_links: false,
  manage_news: false,
  manage_links: false,
  manage_users: false,
  super_admin: false,
} as const

function timestampToIso(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const maybe = value as { toDate?: () => Date }
  if (typeof maybe.toDate !== 'function') return null
  const date = maybe.toDate()
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function listPendingExternalAccounts(_req: Request, res: Response): Promise<void> {
  const snap = await adminDb()
    .collection('users')
    .where('accountStatus', '==', 'pending_approval')
    .get()

  const accounts = snap.docs
    .map((doc) => {
      const data = doc.data()
      return {
        uid: doc.id,
        email: typeof data.email === 'string' ? data.email : '',
        displayName: typeof data.displayName === 'string' ? data.displayName : '',
        department: typeof data.department === 'string' ? data.department : '',
        accountType: data.accountType === 'external' ? 'external' : 'corporate',
        createdAt: timestampToIso(data.createdAt),
      }
    })
    .filter((row) => row.accountType === 'external')
    .sort((a, b) =>
      (a.displayName || a.email).localeCompare(b.displayName || b.email, 'es'),
    )

  res.json({ accounts })
}

async function assertPendingExternal(uid: string) {
  const snap = await adminDb().collection('users').doc(uid).get()
  if (!snap.exists) return { ok: false as const, status: 404, error: 'Usuario no encontrado' }
  if (snap.get('accountType') !== 'external') {
    return { ok: false as const, status: 409, error: 'La cuenta no es externa' }
  }
  if (snap.get('accountStatus') !== 'pending_approval') {
    return { ok: false as const, status: 409, error: 'La cuenta no está pendiente de aprobación' }
  }
  return { ok: true as const, snap }
}

async function writeReviewAudit(
  action: Extract<AuditLogEntry['action'], 'external_account_approved' | 'external_account_rejected'>,
  actor: NonNullable<Request['authedUser']>,
  target: NonNullable<Awaited<ReturnType<typeof loadTargetUser>>>,
  reason: string,
): Promise<void> {
  await writeAuditLogBestEffort({
    userId: actor.uid,
    userEmail: actor.email,
    action,
    targetType: 'user',
    targetId: target.uid,
    targetName: target.targetName,
    parentFolderId: null,
    mimeType: null,
    reason,
    metadata: { accountType: 'external' },
  })
}

export async function approveExternalAccount(req: Request, res: Response): Promise<void> {
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

  const pending = await assertPendingExternal(uid)
  if (!pending.ok) {
    res.status(pending.status).json({ error: pending.error })
    return
  }

  const target = await loadTargetUser(uid)
  if (!target) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }

  await adminDb()
    .collection('users')
    .doc(uid)
    .update({
      accountStatus: 'active',
      permissions: EXTERNAL_APPROVED_PERMISSIONS,
      widgetPreferences: { weather: true, dollar: true },
      favoriteApps: [],
      memberAreaIds: [],
      managedAreaIds: [],
      accountReviewedAt: FieldValue.serverTimestamp(),
      accountReviewedBy: { uid: actor.uid, email: actor.email },
      accountStatusReason: reason,
    })

  try {
    await getAuth().updateUser(uid, { emailVerified: true, disabled: false })
  } catch (err) {
    logError('approveExternalAccount: no se pudo actualizar Firebase Auth', err)
  }

  await writeReviewAudit('external_account_approved', actor, target, reason)
  res.json({ uid, accountStatus: 'active' })
}

export async function rejectExternalAccount(req: Request, res: Response): Promise<void> {
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

  const pending = await assertPendingExternal(uid)
  if (!pending.ok) {
    res.status(pending.status).json({ error: pending.error })
    return
  }

  const target = await loadTargetUser(uid)
  if (!target) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }

  await adminDb()
    .collection('users')
    .doc(uid)
    .update({
      accountStatus: 'rejected',
      accountReviewedAt: FieldValue.serverTimestamp(),
      accountReviewedBy: { uid: actor.uid, email: actor.email },
      accountStatusReason: reason,
    })

  try {
    await getAuth().updateUser(uid, { disabled: true })
  } catch (err) {
    logError('rejectExternalAccount: no se pudo deshabilitar Firebase Auth', err)
  }

  await writeReviewAudit('external_account_rejected', actor, target, reason)
  res.json({ uid, accountStatus: 'rejected' })
}
