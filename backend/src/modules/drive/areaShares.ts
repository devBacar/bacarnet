import { FieldValue, type DocumentData } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { getDrive } from '../../lib/google/driveClient.js'
import { logError } from '../../lib/log.js'
import { writeAuditLogBestEffort } from '../audit/writeAuditLog.js'
import { getFileInSharedDrive, googleStatus, googleUserMessage } from './assertInSharedDrive.js'
import {
  DrivePermissionAlreadyInheritedError,
  findUserPermission,
  grantUserDrivePermission,
  isInheritedPermission,
  isPermissionRole,
  type PermissionRole,
} from './driveUserPermission.js'
import { invalidateDriveMetadataForEmail } from './driveMetadataCache.js'

export const DRIVE_AREA_SHARES = 'driveAreaShares'

export type AreaShareGrant = {
  email: string
  uid: string
  permissionId: string
}

export type DriveAreaShare = {
  fileId: string
  areaId: string
  role: PermissionRole
  createdBy: string
  grants: AreaShareGrant[]
}

export type AreaShareSyncActor = {
  uid: string
  email: string
}

export type AreaShareSyncResult = {
  uid: string
  granted: number
  revoked: number
  unchanged: number
  failures: Array<{ fileId: string; areaId: string; error: string }>
}

export class AreaShareUserNotFoundError extends Error {
  constructor() {
    super('Usuario no encontrado')
    this.name = 'AreaShareUserNotFoundError'
  }
}

type ExistingUserPermission = {
  id: string
  inherited: boolean
}

export type AreaShareSyncDecision =
  | { kind: 'noop' }
  | { kind: 'skip-manual' }
  | { kind: 'skip-inherited' }
  | { kind: 'drop-tracking' }
  | { kind: 'grant' }
  | { kind: 'revoke'; permissionId: string }

export function areaShareDocId(fileId: string, areaId: string): string {
  return `${fileId}_${areaId}`
}

export function decideAreaShareSync(input: {
  belongsToArea: boolean
  tracked: { permissionId: string } | null
  existing: ExistingUserPermission | null
}): AreaShareSyncDecision {
  const { belongsToArea, tracked, existing } = input

  if (belongsToArea) {
    if (tracked && existing && existing.id === tracked.permissionId && !existing.inherited) {
      return { kind: 'noop' }
    }
    if (existing?.inherited) {
      return { kind: tracked ? 'drop-tracking' : 'skip-inherited' }
    }
    if (existing && !existing.inherited) {
      return { kind: tracked ? 'drop-tracking' : 'skip-manual' }
    }
    return { kind: 'grant' }
  }

  if (tracked) return { kind: 'revoke', permissionId: tracked.permissionId }
  return { kind: 'noop' }
}

function parseGrants(raw: unknown): AreaShareGrant[] {
  if (!Array.isArray(raw)) return []
  const rows: AreaShareGrant[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : ''
    const uid = typeof row.uid === 'string' ? row.uid.trim() : ''
    const permissionId = typeof row.permissionId === 'string' ? row.permissionId.trim() : ''
    if (!email || !permissionId) continue
    rows.push({ email, uid, permissionId })
  }
  return rows
}

function parseShare(data: DocumentData): DriveAreaShare | null {
  const fileId = typeof data.fileId === 'string' ? data.fileId.trim() : ''
  const areaId = typeof data.areaId === 'string' ? data.areaId.trim() : ''
  if (!fileId || !areaId || !isPermissionRole(data.role)) return null
  const createdBy = typeof data.createdBy === 'string' ? data.createdBy : ''
  return {
    fileId,
    areaId,
    role: data.role,
    createdBy,
    grants: parseGrants(data.grants),
  }
}

function samePerson(row: AreaShareGrant, email: string, uid: string): boolean {
  if (row.email === email) return true
  return uid.length > 0 && row.uid === uid
}

export function grantsWithoutPerson(
  grants: AreaShareGrant[],
  email: string,
  uid: string,
): AreaShareGrant[] {
  return grants.filter((row) => !samePerson(row, email, uid))
}

export function grantsWithPerson(grants: AreaShareGrant[], row: AreaShareGrant): AreaShareGrant[] {
  return [...grantsWithoutPerson(grants, row.email, row.uid), row]
}

export async function getDriveAreaShare(
  fileId: string,
  areaId: string,
): Promise<DriveAreaShare | null> {
  const snap = await adminDb().collection(DRIVE_AREA_SHARES).doc(areaShareDocId(fileId, areaId)).get()
  if (!snap.exists) return null
  return parseShare(snap.data() ?? {})
}

export async function listAreaSharesForFile(fileId: string): Promise<DriveAreaShare[]> {
  const snap = await adminDb().collection(DRIVE_AREA_SHARES).where('fileId', '==', fileId).get()
  const shares: DriveAreaShare[] = []
  for (const doc of snap.docs) {
    const parsed = parseShare(doc.data())
    if (parsed) shares.push(parsed)
  }
  return shares
}

export async function listAllAreaShares(): Promise<DriveAreaShare[]> {
  const snap = await adminDb().collection(DRIVE_AREA_SHARES).get()
  const shares: DriveAreaShare[] = []
  for (const doc of snap.docs) {
    const parsed = parseShare(doc.data())
    if (parsed) shares.push(parsed)
  }
  return shares
}

export async function saveDriveAreaShare(input: {
  fileId: string
  areaId: string
  role: PermissionRole
  createdBy: string
  grants: AreaShareGrant[]
}): Promise<void> {
  const ref = adminDb().collection(DRIVE_AREA_SHARES).doc(areaShareDocId(input.fileId, input.areaId))
  const snap = await ref.get()
  const grants = input.grants
  if (snap.exists) {
    await ref.set(
      {
        fileId: input.fileId,
        areaId: input.areaId,
        role: input.role,
        grants,
        createdBy: typeof snap.get('createdBy') === 'string' ? snap.get('createdBy') : input.createdBy,
        createdAt: snap.get('createdAt') ?? FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    return
  }
  await ref.set({
    fileId: input.fileId,
    areaId: input.areaId,
    role: input.role,
    grants,
    createdBy: input.createdBy,
    createdAt: FieldValue.serverTimestamp(),
  })
}

async function replaceGrants(fileId: string, areaId: string, grants: AreaShareGrant[]): Promise<void> {
  await adminDb()
    .collection(DRIVE_AREA_SHARES)
    .doc(areaShareDocId(fileId, areaId))
    .update({ grants })
}

function readAreaIds(data: DocumentData): Set<string> {
  const ids = new Set<string>()
  for (const field of ['memberAreaIds', 'managedAreaIds'] as const) {
    const raw = data[field]
    if (!Array.isArray(raw)) continue
    for (const id of raw) {
      if (typeof id === 'string' && id.trim().length > 0) ids.add(id.trim())
    }
  }
  return ids
}

type FileAuditMeta = {
  name: string
  parentFolderId: string | null
  mimeType: string | null
}

/**
 * Da los accesos que falten por reglas de las áreas actuales del usuario
 * y quita solo los que haya dado una regla de un área a la que ya no pertenece.
 */
export async function sincronizarAccesosDeAreaParaUsuario(
  uid: string,
  actor: AreaShareSyncActor,
): Promise<AreaShareSyncResult> {
  const userSnap = await adminDb().collection('users').doc(uid).get()
  if (!userSnap.exists) throw new AreaShareUserNotFoundError()

  const data = userSnap.data() ?? {}
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : ''
  if (!email) throw new AreaShareUserNotFoundError()

  const areaIds = readAreaIds(data)
  const shares = await listAllAreaShares()
  const drive = await getDrive()
  const fileMeta = new Map<string, FileAuditMeta | null>()

  const result: AreaShareSyncResult = {
    uid,
    granted: 0,
    revoked: 0,
    unchanged: 0,
    failures: [],
  }

  const metaFor = async (fileId: string): Promise<FileAuditMeta | null> => {
    if (fileMeta.has(fileId)) return fileMeta.get(fileId) ?? null
    const found = await getFileInSharedDrive(fileId)
    const meta =
      found.ok && !found.file.trashed
        ? {
            name: found.file.name,
            parentFolderId: found.file.parentFolderId,
            mimeType: found.file.mimeType,
          }
        : null
    fileMeta.set(fileId, meta)
    return meta
  }

  for (const share of shares) {
    try {
      const existingPerm = await findUserPermission(drive, share.fileId, email)
      const existing =
        existingPerm?.id != null && existingPerm.id.length > 0
          ? {
              id: existingPerm.id,
              inherited: isInheritedPermission(existingPerm.permissionDetails ?? undefined),
            }
          : null
      const tracked =
        share.grants.find((row) => samePerson(row, email, uid)) ?? null
      const decision = decideAreaShareSync({
        belongsToArea: areaIds.has(share.areaId),
        tracked: tracked ? { permissionId: tracked.permissionId } : null,
        existing,
      })

      if (
        decision.kind === 'noop' ||
        decision.kind === 'skip-manual' ||
        decision.kind === 'skip-inherited'
      ) {
        result.unchanged += 1
        continue
      }

      if (decision.kind === 'drop-tracking') {
        await replaceGrants(share.fileId, share.areaId, grantsWithoutPerson(share.grants, email, uid))
        result.unchanged += 1
        continue
      }

      if (decision.kind === 'grant') {
        const meta = await metaFor(share.fileId)
        if (!meta) {
          result.failures.push({
            fileId: share.fileId,
            areaId: share.areaId,
            error: 'El archivo no está disponible',
          })
          continue
        }
        try {
          const granted = await grantUserDrivePermission(drive, share.fileId, email, share.role, {
            sendNotificationEmail: false,
          })
          const nextGrant: AreaShareGrant = {
            email,
            uid,
            permissionId: granted.permissionId,
          }
          await replaceGrants(
            share.fileId,
            share.areaId,
            grantsWithPerson(share.grants, nextGrant),
          )
          await writeAuditLogBestEffort({
            userId: actor.uid,
            userEmail: actor.email,
            action: 'permission_grant',
            targetType: 'file',
            targetId: share.fileId,
            targetName: meta.name,
            parentFolderId: meta.parentFolderId,
            mimeType: meta.mimeType,
            reason: 'Acceso porque pertenece al área',
            metadata: {
              granteeEmail: email,
              granteeUid: uid,
              role: share.role,
              permissionId: granted.permissionId,
              type: 'user',
              areaShareSync: true,
              areaId: share.areaId,
            },
          })
          await invalidateDriveMetadataForEmail(email)
          result.granted += 1
        } catch (err) {
          if (err instanceof DrivePermissionAlreadyInheritedError) {
            result.unchanged += 1
            continue
          }
          throw err
        }
        continue
      }

      const meta = await metaFor(share.fileId)
      let deleted = false
      try {
        await drive.permissions.delete({
          fileId: share.fileId,
          permissionId: decision.permissionId,
          supportsAllDrives: true,
          enforceExpansiveAccess: true,
        })
        deleted = true
      } catch (err) {
        if (googleStatus(err) !== 404) throw err
      }

      await replaceGrants(share.fileId, share.areaId, grantsWithoutPerson(share.grants, email, uid))
      if (deleted && meta) {
        await writeAuditLogBestEffort({
          userId: actor.uid,
          userEmail: actor.email,
          action: 'permission_revoke',
          targetType: 'file',
          targetId: share.fileId,
          targetName: meta.name,
          parentFolderId: meta.parentFolderId,
          mimeType: meta.mimeType,
          reason: 'Ya no pertenece al área',
          metadata: {
            granteeEmail: email,
            granteeUid: uid,
            permissionId: decision.permissionId,
            type: 'user',
            areaShareSync: true,
            areaId: share.areaId,
          },
        })
        await invalidateDriveMetadataForEmail(email)
      }
      result.revoked += 1
    } catch (err) {
      logError('sincronizarAccesosDeAreaParaUsuario: falló un archivo', err)
      result.failures.push({
        fileId: share.fileId,
        areaId: share.areaId,
        error: googleUserMessage(err) ?? 'No se pudo actualizar el acceso',
      })
    }
  }

  return result
}

export async function removeAreaShareRule(input: {
  fileId: string
  areaId: string
  actor: AreaShareSyncActor
  fileName: string
  parentFolderId: string | null
  mimeType: string | null
  areaName: string
}): Promise<{
  deleted: boolean
  removedCount: number
  failedCount: number
  failures: Array<{ email: string; error: string }>
}> {
  const share = await getDriveAreaShare(input.fileId, input.areaId)
  if (!share) {
    return { deleted: false, removedCount: 0, failedCount: 0, failures: [] }
  }

  const drive = await getDrive()
  const removedEmails = new Set<string>()
  const failures: Array<{ email: string; error: string }> = []

  for (const grant of share.grants) {
    try {
      await drive.permissions.delete({
        fileId: input.fileId,
        permissionId: grant.permissionId,
        supportsAllDrives: true,
        enforceExpansiveAccess: true,
      })
      removedEmails.add(grant.email)
      await writeAuditLogBestEffort({
        userId: input.actor.uid,
        userEmail: input.actor.email,
        action: 'permission_revoke',
        targetType: 'file',
        targetId: input.fileId,
        targetName: input.fileName,
        parentFolderId: input.parentFolderId,
        mimeType: input.mimeType,
        reason: 'Dejó de compartir con el área desde Archivos',
        metadata: {
          granteeEmail: grant.email,
          granteeUid: grant.uid,
          permissionId: grant.permissionId,
          type: 'user',
          areaShareRemoved: true,
          areaId: input.areaId,
        },
      })
      await invalidateDriveMetadataForEmail(grant.email)
    } catch (err) {
      if (googleStatus(err) === 404) {
        removedEmails.add(grant.email)
        continue
      }
      logError('No se pudo quitar un permiso de la regla de área', err)
      failures.push({
        email: grant.email,
        error: googleUserMessage(err) ?? 'No se pudo quitar el acceso',
      })
    }
  }

  const ref = adminDb().collection(DRIVE_AREA_SHARES).doc(areaShareDocId(input.fileId, input.areaId))
  if (failures.length === 0) {
    await ref.delete()
    await writeAuditLogBestEffort({
      userId: input.actor.uid,
      userEmail: input.actor.email,
      action: 'permission_revoke',
      targetType: 'file',
      targetId: input.fileId,
      targetName: input.fileName,
      parentFolderId: input.parentFolderId,
      mimeType: input.mimeType,
      reason: 'Dejó de compartir con el área desde Archivos',
      metadata: {
        areaShareRemoved: true,
        areaId: input.areaId,
        areaName: input.areaName,
        removedCount: removedEmails.size,
      },
    })
    return {
      deleted: true,
      removedCount: removedEmails.size,
      failedCount: 0,
      failures: [],
    }
  }

  await ref.update({
    grants: share.grants.filter((row) => !removedEmails.has(row.email)),
  })
  return {
    deleted: false,
    removedCount: removedEmails.size,
    failedCount: failures.length,
    failures,
  }
}
