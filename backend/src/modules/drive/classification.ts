import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'

export const DRIVE_FILES_COLLECTION = 'driveFiles'

export const CLASSIFICATIONS = ['USO_INTERNO', 'CONFIDENCIAL', 'RESTRINGIDO'] as const
export type FileClassification = (typeof CLASSIFICATIONS)[number]

export const DEFAULT_CLASSIFICATION: FileClassification = 'USO_INTERNO'

export const FILE_STATUSES = ['BORRADOR', 'APROBADO'] as const
export type FileApprovalStatus = (typeof FILE_STATUSES)[number]
export const DEFAULT_STATUS: FileApprovalStatus = 'BORRADOR'

export function isFileStatus(value: unknown): value is FileApprovalStatus {
  return typeof value === 'string' && (FILE_STATUSES as readonly string[]).includes(value)
}

export type DrivePermissionType = 'user' | 'domain' | 'anyone'

/**
 * Único choke point antes de `permissions.create`.
 * - `anyone` (link público): siempre bloqueado.
 * - `domain` (“cualquiera en Bacarsa con el link”): bloqueado si RESTRINGIDO.
 * - `user` (persona puntual): la clasificación no bloquea; el endpoint interno
 *   igual exige @bacarsa.com.ar. La copia autorizada (5c) usa `user` con email
 *   externo sobre la copia, no sobre el original.
 */
export function permissionCreateDeniedReason(
  classification: FileClassification,
  type: DrivePermissionType,
): string | null {
  if (type === 'anyone') {
    return 'No se permite compartir con un link público. Otorgá el acceso a una persona específica o al dominio Bacarsa.'
  }
  if (type === 'domain' && classification === 'RESTRINGIDO') {
    return 'Los archivos Restringidos no pueden compartirse con un link genérico, otorgá el acceso a una persona específica'
  }
  return null
}

export function isFileClassification(value: unknown): value is FileClassification {
  return typeof value === 'string' && (CLASSIFICATIONS as readonly string[]).includes(value)
}

/** Ausente / null / undefined → default. String inválido → error. */
export function parseClassificationInput(
  value: unknown,
): { ok: true; classification: FileClassification } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, classification: DEFAULT_CLASSIFICATION }
  }
  if (!isFileClassification(value)) {
    return {
      ok: false,
      error: `classification debe ser ${CLASSIFICATIONS.join(', ')}`,
    }
  }
  return { ok: true, classification: value }
}

export async function getStoredClassification(fileId: string): Promise<FileClassification> {
  const snap = await adminDb().collection(DRIVE_FILES_COLLECTION).doc(fileId).get()
  const raw = snap.exists ? snap.get('classification') : undefined
  return isFileClassification(raw) ? raw : DEFAULT_CLASSIFICATION
}

export async function getStoredStatus(fileId: string): Promise<FileApprovalStatus> {
  const snap = await adminDb().collection(DRIVE_FILES_COLLECTION).doc(fileId).get()
  const raw = snap.exists ? snap.get('status') : undefined
  return isFileStatus(raw) ? raw : DEFAULT_STATUS
}

export async function writeFileClassification(
  fileId: string,
  classification: FileClassification,
  actor: { uid: string; email: string },
  extras?: {
    status?: FileApprovalStatus
    governingAreaId?: string | null
    createdByUserId?: string
    createdByEmail?: string
    createdByDisplayName?: string
  },
): Promise<void> {
  const payload: Record<string, unknown> = {
    classification,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUserId: actor.uid,
    updatedByEmail: actor.email,
  }
  if (extras?.status) payload.status = extras.status
  if (extras && 'governingAreaId' in extras) {
    payload.governingAreaId = extras.governingAreaId ?? null
  }
  if (extras && 'createdByUserId' in extras) {
    payload.createdByUserId = extras.createdByUserId ?? null
  }
  if (extras && 'createdByEmail' in extras) {
    payload.createdByEmail = extras.createdByEmail ?? null
  }
  if (extras && 'createdByDisplayName' in extras) {
    payload.createdByDisplayName = extras.createdByDisplayName ?? null
  }

  await adminDb().collection(DRIVE_FILES_COLLECTION).doc(fileId).set(payload, { merge: true })
}

/** Drive ya existe: no revertir create si falla el sidecar. */
export async function writeFileClassificationBestEffort(
  fileId: string,
  classification: FileClassification,
  actor: { uid: string; email: string },
  extras?: {
    status?: FileApprovalStatus
    governingAreaId?: string | null
    createdByUserId?: string
    createdByEmail?: string
    createdByDisplayName?: string
  },
): Promise<void> {
  try {
    await writeFileClassification(fileId, classification, actor, extras)
  } catch (err) {
    logError('driveFiles: no se pudo guardar classification', err)
  }
}

export async function writeFolderSidecarBestEffort(
  folderId: string,
  actor: { uid: string; email: string; displayName?: string },
  extras: {
    governingAreaId?: string | null
    classification?: FileClassification
  },
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      governingAreaId: extras.governingAreaId ?? null,
      createdByUserId: actor.uid,
      createdByEmail: actor.email,
      createdByDisplayName: actor.displayName?.trim() || actor.email,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUserId: actor.uid,
      updatedByEmail: actor.email,
    }
    if (extras.classification) {
      payload.classification = extras.classification
    }

    await adminDb().collection(DRIVE_FILES_COLLECTION).doc(folderId).set(payload, { merge: true })
  } catch (err) {
    logError('driveFiles: no se pudo guardar sidecar de carpeta', err)
  }
}

export async function writeFileStatus(
  fileId: string,
  status: FileApprovalStatus,
  actor: { uid: string; email: string },
): Promise<void> {
  await adminDb()
    .collection(DRIVE_FILES_COLLECTION)
    .doc(fileId)
    .set(
      {
        status,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUserId: actor.uid,
        updatedByEmail: actor.email,
      },
      { merge: true },
    )
}
