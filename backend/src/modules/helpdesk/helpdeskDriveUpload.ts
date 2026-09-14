import { Readable } from 'node:stream'
import type { AuthedUser } from '../auth/middleware.js'
import { getEnv } from '../../config/env.js'
import { getDrive } from '../../lib/google/driveClient.js'
import { sanitizeDriveId } from '../../lib/google/driveIds.js'
import { logError } from '../../lib/log.js'
import { getFileInSharedDrive } from '../drive/assertInSharedDrive.js'
import { grantUserDrivePermission } from '../drive/driveUserPermission.js'
import { resolveDriveSubject } from '../drive/driveSubject.js'
import {
  HELPDESK_ANALISIS_DRIVE_FOLDER_ID_DEFAULT,
  type HelpdeskAnalisis,
} from './types.js'
import { helpdeskDocumentMaxBytes, isHelpdeskDocumentMime } from './helpdeskDocumentMime.js'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

export function resolveHelpdeskAnalisisFolderId(): string {
  const fromEnv = process.env.HELPDESK_ANALISIS_DRIVE_FOLDER_ID?.trim()
  const id = sanitizeDriveId(fromEnv || HELPDESK_ANALISIS_DRIVE_FOLDER_ID_DEFAULT)
  if (!id) return HELPDESK_ANALISIS_DRIVE_FOLDER_ID_DEFAULT
  return id
}

export type HelpdeskDriveUploadInput = {
  user: AuthedUser
  fileName: string
  mimeType: string
  buffer: Buffer
}

export type HelpdeskDriveUploadResult =
  | { ok: true; fileId: string; webViewLink: string }
  | { ok: false; status: number; error: string }

export async function uploadHelpdeskDocumentToDrive(
  input: HelpdeskDriveUploadInput,
): Promise<HelpdeskDriveUploadResult> {
  if (input.buffer.length > helpdeskDocumentMaxBytes()) {
    return { ok: false, status: 413, error: 'El archivo supera el límite de 25 MB' }
  }

  const mimeType = input.mimeType.trim().toLowerCase()
  if (!isHelpdeskDocumentMime(mimeType, input.fileName)) {
    return {
      ok: false,
      status: 400,
      error: 'Solo se permiten documentos Office o PDF',
    }
  }

  const parentFolderId = resolveHelpdeskAnalisisFolderId()
  const driveSubject = resolveDriveSubject(input.user)
  const parent = await getFileInSharedDrive(parentFolderId, driveSubject)
  if (!parent.ok) {
    return { ok: false, status: parent.status, error: parent.error }
  }
  if (parent.file.trashed) {
    return { ok: false, status: 400, error: 'La carpeta destino está en la papelera' }
  }
  if (parent.file.mimeType !== FOLDER_MIME) {
    return { ok: false, status: 400, error: 'La carpeta de análisis no es válida' }
  }

  const name = input.fileName.slice(0, 255)
  try {
    const drive = await getDrive(driveSubject)
    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType,
        parents: [parentFolderId],
      },
      media: {
        mimeType,
        body: Readable.from(input.buffer),
      },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    })

    const fileId = created.data.id ?? ''
    const webViewLink = created.data.webViewLink ?? ''
    if (!fileId || !webViewLink) {
      return { ok: false, status: 500, error: 'No se pudo crear el archivo en Drive' }
    }

    return { ok: true, fileId, webViewLink }
  } catch (err) {
    logError('uploadHelpdeskDocumentToDrive falló', err)
    return { ok: false, status: 500, error: 'No se pudo subir el archivo a Drive' }
  }
}

/** Comparte el archivo con lectores; usa cuenta de gobierno para permisos puntuales. */
export async function shareHelpdeskDriveFileWithReaders(
  fileId: string,
  readerEmails: string[],
): Promise<void> {
  const governanceEmail = getEnv().driveImpersonateEmail
  const drive = await getDrive(governanceEmail)
  const unique = [...new Set(readerEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))]

  for (const email of unique) {
    try {
      await grantUserDrivePermission(drive, fileId, email, 'reader', {
        sendNotificationEmail: false,
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'DrivePermissionAlreadyInheritedError') {
        continue
      }
      logError(`No se pudo compartir ${fileId} con ${email}`, err)
    }
  }
}

export function truncateProblematicaForEmail(text: string, maxLen = 500): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLen) return trimmed
  return `${trimmed.slice(0, maxLen - 1)}…`
}

function timestampToIso(value: { toDate?: () => Date } | undefined): string | null {
  if (!value || typeof value.toDate !== 'function') return null
  return value.toDate().toISOString()
}

export function serializeHelpdeskAnalisis(analisis: HelpdeskAnalisis & { id: string }) {
  return {
    id: analisis.id,
    archivoDriveId: analisis.archivoDriveId,
    archivoDriveLink: analisis.archivoDriveLink,
    subidoPorNombre: analisis.subidoPorNombre,
    subidoPorEmail: analisis.subidoPorEmail,
    subidoFecha: timestampToIso(analisis.subidoFecha) ?? new Date().toISOString(),
    aprobadoresEmails: analisis.aprobadoresEmails,
    estado: analisis.estado,
    decididoPorEmail: analisis.decididoPorEmail ?? null,
    decididoFecha: analisis.decididoFecha?.toDate?.()?.toISOString() ?? null,
    comentarioDecision: analisis.comentarioDecision ?? null,
  }
}
