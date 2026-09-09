import type { Readable } from 'node:stream'
import type { AuthedUser } from '../auth/middleware.js'
import { getDrive } from '../../lib/google/driveClient.js'
import { logError } from '../../lib/log.js'
import { writeAuditLogBestEffort } from '../audit/writeAuditLog.js'
import { googleStatus, googleUserMessage } from './assertInSharedDrive.js'
import { writeFileClassificationBestEffort, type FileClassification } from './classification.js'
import { invalidateDriveMetadataForUser } from './driveMetadataCache.js'
import { resolveDriveSubject } from './driveSubject.js'

export type CommitDriveUploadInput = {
  user: AuthedUser
  driveSubject: string
  parentFolderId: string
  name: string
  mimeType: string
  classification: FileClassification
  governingAreaId: string | null
  reason: string
  mediaBody: Readable
  sizeHint?: number
  uploadKind: 'multipart' | 'staging'
}

export type CommitDriveUploadResult =
  | {
      ok: true
      body: Record<string, unknown>
    }
  | {
      ok: false
      status: number
      error: string
      detail?: string
    }

export async function commitDriveUpload(
  input: CommitDriveUploadInput,
): Promise<CommitDriveUploadResult> {
  const name = input.name.slice(0, 255)

  try {
    const drive = await getDrive(input.driveSubject)
    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: input.mimeType,
        parents: [input.parentFolderId],
      },
      media: {
        mimeType: input.mimeType,
        body: input.mediaBody,
      },
      fields: 'id, name, mimeType, webViewLink, parents, modifiedTime, createdTime, size',
      supportsAllDrives: true,
    })

    const id = created.data.id ?? ''
    await writeFileClassificationBestEffort(
      id,
      input.classification,
      { uid: input.user.uid, email: input.user.email },
      {
        status: 'BORRADOR',
        governingAreaId: input.governingAreaId,
        createdByUserId: input.user.uid,
        createdByEmail: input.user.email,
        createdByDisplayName: input.user.displayName,
      },
    )

    await writeAuditLogBestEffort({
      userId: input.user.uid,
      userEmail: input.user.email,
      action: 'create',
      targetType: 'file',
      targetId: id,
      targetName: created.data.name ?? name,
      parentFolderId: input.parentFolderId,
      mimeType: created.data.mimeType ?? input.mimeType,
      reason: input.reason,
      metadata: {
        type: 'upload',
        uploadKind: input.uploadKind,
        classification: input.classification,
        status: 'BORRADOR',
        governingAreaId: input.governingAreaId,
        size: created.data.size ?? String(input.sizeHint ?? ''),
      },
    })

    invalidateDriveMetadataForUser(resolveDriveSubject(input.user), input.user.uid)

    return {
      ok: true,
      body: {
        id,
        name: created.data.name ?? name,
        mimeType: created.data.mimeType ?? input.mimeType,
        webViewLink: created.data.webViewLink ?? null,
        modifiedTime: created.data.modifiedTime ?? null,
        createdTime: created.data.createdTime ?? null,
        size: created.data.size ?? String(input.sizeHint ?? ''),
        isFolder: false,
        classification: input.classification,
        status: 'BORRADOR',
        governingAreaId: input.governingAreaId,
        createdBy: {
          userId: input.user.uid,
          email: input.user.email,
          displayName: input.user.displayName,
          source: 'intranet',
        },
      },
    }
  } catch (err) {
    logError('Drive files.create (upload) falló', err)
    const status = googleStatus(err)
    const detail = googleUserMessage(err)
    return {
      ok: false,
      status: status === 403 || status === 404 ? status : 502,
      error:
        status === 403
          ? 'No tenés permiso para subir archivos en esta carpeta'
          : status === 404
            ? 'Carpeta destino no encontrada o sin acceso'
            : 'No se pudo subir el archivo a Drive',
      detail: detail || undefined,
    }
  }
}
