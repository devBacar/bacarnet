import { FieldValue, type DocumentData } from 'firebase-admin/firestore'
import { getEnv, isEmailInAllowedDomain } from '../../config/env.js'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError, logInfo } from '../../lib/log.js'
import type { AuthedUser } from '../auth/middleware.js'
import { grantBoardAccess } from '../boards/boardAccess.js'
import { writeAuditLogBestEffort } from '../audit/writeAuditLog.js'

const PENDING_COLLECTION = 'pendingUserSetup'
const SUPER_ADMIN_EMAILS = new Set([
  'admin@bacarsa.com.ar',
  'sistemas.ti@bacarsa.com.ar',
])

export interface PendingBoardAccess {
  boardFolderId: string
  boardName?: string
}

const CLAVES_PERMISO = [
  'view_directory',
  'view_drive',
  'rag_assistant',
  'rrhh_detalle',
  'view_finanzas',
  'finanzas_agenda',
  'finanzas_cheques',
  'finanzas_categorias',
  'finanzas_transferencias',
  'finanzas_destinatarios',
  'finanzas_saldos',
  'manage_finanzas_caja',
] as const

type ClavePermisoPendiente = (typeof CLAVES_PERMISO)[number]

export interface PendingUserSetupData {
  email: string
  role?: 'admin' | 'user'
  managedAreaIds?: string[]
  memberAreaIds?: string[]
  permissions?: Partial<Record<ClavePermisoPendiente, boolean>>
  boardAccess?: PendingBoardAccess[]
  note?: string
  createdByUid?: string
  createdByEmail?: string
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

function parseBoardAccess(value: unknown): PendingBoardAccess[] {
  if (!Array.isArray(value)) return []
  const rows: PendingBoardAccess[] = []
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const record = row as Record<string, unknown>
    const boardFolderId =
      typeof record.boardFolderId === 'string' ? record.boardFolderId.trim() : ''
    if (!boardFolderId) continue
    const boardNameRaw = record.boardName
    const entry: PendingBoardAccess = { boardFolderId }
    if (typeof boardNameRaw === 'string' && boardNameRaw.trim()) {
      entry.boardName = boardNameRaw.trim()
    }
    rows.push(entry)
  }
  return rows
}

function parsePermissions(
  value: unknown,
): Partial<Record<ClavePermisoPendiente, boolean>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const permissions: Partial<Record<ClavePermisoPendiente, boolean>> = {}
  for (const clave of CLAVES_PERMISO) {
    const valor = raw[clave]
    if (typeof valor === 'boolean') permissions[clave] = valor
  }
  return permissions
}

function parsePendingData(email: string, data: DocumentData): PendingUserSetupData | null {
  const roleRaw = data.role
  const role =
    roleRaw === 'admin' || roleRaw === 'user' ? roleRaw : undefined
  const permissions = parsePermissions(data.permissions)

  return {
    email,
    role,
    managedAreaIds: normalizeStringArray(data.managedAreaIds),
    memberAreaIds: normalizeStringArray(data.memberAreaIds),
    permissions,
    boardAccess: parseBoardAccess(data.boardAccess),
    note: typeof data.note === 'string' ? data.note.trim() : undefined,
    createdByUid: typeof data.createdByUid === 'string' ? data.createdByUid : undefined,
    createdByEmail:
      typeof data.createdByEmail === 'string'
        ? normalizeEmail(data.createdByEmail)
        : undefined,
  }
}

function provisioningActor(pending: PendingUserSetupData): AuthedUser {
  return {
    uid: pending.createdByUid ?? 'system',
    email: pending.createdByEmail ?? 'intranet@system',
    displayName: 'Auto-aprovisionamiento',
    managedAreaIds: [],
    actionGrants: {},
    permissions: {},
  }
}

/**
 * Aplica pendingUserSetup/{email} al perfil recién creado.
 * Idempotente: si `applied === true`, no hace nada.
 */
export async function applyPendingUserSetupForNewUser(input: {
  uid: string
  email: string
  displayName: string
}): Promise<{ applied: boolean; reason?: string }> {
  const normalizedEmail = normalizeEmail(input.email)
  const domain = getEnv().allowedEmailDomain

  if (!normalizedEmail || !isEmailInAllowedDomain(normalizedEmail, domain)) {
    return { applied: false, reason: 'email_invalid' }
  }

  if (SUPER_ADMIN_EMAILS.has(normalizedEmail)) {
    return { applied: false, reason: 'super_admin_skipped' }
  }

  const pendingRef = adminDb().collection(PENDING_COLLECTION).doc(normalizedEmail)

  const appliedPayload = await adminDb().runTransaction(async (tx) => {
    const pendingSnap = await tx.get(pendingRef)
    if (!pendingSnap.exists) {
      return null
    }

    if (pendingSnap.get('applied') === true) {
      return { alreadyApplied: true as const }
    }

    const pending = parsePendingData(normalizedEmail, pendingSnap.data() ?? {})
    if (!pending) {
      return null
    }

    const userRef = adminDb().collection('users').doc(input.uid)
    const userSnap = await tx.get(userRef)
    if (!userSnap.exists) {
      throw new Error(`users/${input.uid} no existe al aplicar pending setup`)
    }

    const userPatch: Record<string, unknown> = {}
    const existingPermissions =
      userSnap.get('permissions') &&
      typeof userSnap.get('permissions') === 'object' &&
      !Array.isArray(userSnap.get('permissions'))
        ? { ...(userSnap.get('permissions') as Record<string, unknown>) }
        : {}

    let permisosTocados = false
    for (const clave of CLAVES_PERMISO) {
      const valor = pending.permissions?.[clave]
      if (valor === undefined) continue
      existingPermissions[clave] = valor
      permisosTocados = true
    }
    if (permisosTocados) {
      userPatch.permissions = existingPermissions
    }

    if (pending.role === 'admin' || pending.role === 'user') {
      userPatch.role = pending.role
    }

    if (pending.memberAreaIds && pending.memberAreaIds.length > 0) {
      userPatch.memberAreaIds = pending.memberAreaIds
    }

    const effectiveRole =
      pending.role ?? (typeof userSnap.get('role') === 'string' ? userSnap.get('role') : 'user')

    if (effectiveRole === 'admin' && pending.managedAreaIds) {
      userPatch.managedAreaIds = pending.managedAreaIds
    } else if (pending.role === 'user') {
      userPatch.managedAreaIds = []
    }

    if (Object.keys(userPatch).length > 0) {
      tx.update(userRef, userPatch)
    }

    tx.update(pendingRef, {
      applied: true,
      appliedAt: FieldValue.serverTimestamp(),
      appliedToUid: input.uid,
    })

    return { pending, userPatch }
  })

  if (!appliedPayload) {
    return { applied: false, reason: 'no_pending' }
  }

  if ('alreadyApplied' in appliedPayload) {
    return { applied: false, reason: 'already_applied' }
  }

  const { pending, userPatch } = appliedPayload
  const actor = provisioningActor(pending)
  const boardResults: Array<{ boardFolderId: string; granted: boolean }> = []

  for (const board of pending.boardAccess ?? []) {
    try {
      const result = await grantBoardAccess({
        boardFolderId: board.boardFolderId,
        boardName: board.boardName ?? board.boardFolderId,
        grantee: {
          uid: input.uid,
          email: normalizedEmail,
          displayName: input.displayName.trim() || normalizedEmail,
        },
        actor,
      })
      boardResults.push({ boardFolderId: board.boardFolderId, granted: result.granted })
    } catch (err) {
      logError(`pending setup: falló grant de tablero ${board.boardFolderId}`, err)
      boardResults.push({ boardFolderId: board.boardFolderId, granted: false })
    }
  }

  await writeAuditLogBestEffort({
    userId: actor.uid,
    userEmail: actor.email,
    action: 'pending_setup_applied',
    targetType: 'user',
    targetId: input.uid,
    targetName: input.displayName.trim() || normalizedEmail,
    parentFolderId: null,
    mimeType: null,
    reason: pending.note ?? null,
    metadata: {
      pendingEmail: normalizedEmail,
      appliedFields: userPatch,
      boardAccess: boardResults,
      pendingCreatedBy: pending.createdByEmail ?? null,
    },
  })

  logInfo(`pendingUserSetup aplicado para ${normalizedEmail} → users/${input.uid}`)
  return { applied: true }
}
