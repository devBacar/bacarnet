import type { AuthedUser } from '../auth/middleware.js'
import { sanitizeDriveId } from '../../lib/google/driveIds.js'
import { getFileInSharedDrive } from './assertInSharedDrive.js'
import { parseClassificationInput, type FileClassification } from './classification.js'
import {
  isInstallerArea,
  isInstallerFilename,
  validateInstallerUpload,
} from './installerUploadPolicy.js'
import { getAllowedUploadMimeTypes, getMinReasonLength, isOfficeUploadMime } from './policy.js'
import { resolveDriveSubject } from './driveSubject.js'
import { resolveGoverningAreaId } from './resolveGoverningArea.js'
import { STAGING_UPLOAD_MAX_BYTES, formatUploadSizeLimit } from './uploadLimits.js'
import { isAllowedBinaryUploadMime, normalizeUploadMime, BINARY_UPLOAD_MIMES } from './uploadMimePolicy.js'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

export type ValidatedDriveUpload = {
  parentFolderId: string
  reason: string
  classification: FileClassification
  governingAreaId: string | null
  name: string
  mimeType: string
  isInstaller: boolean
  driveSubject: string
}

export type UploadValidationResult =
  | { ok: true; value: ValidatedDriveUpload }
  | { ok: false; status: number; error: string; code?: string; allowedMimeTypes?: string[] }

export async function validateDriveUploadInput(input: {
  user: AuthedUser
  parentFolderIdRaw: string
  reasonRaw: string
  classificationRaw: string
  fileName: string
  mimeType: string
  fileSize: number
  allowOffice?: boolean
}): Promise<UploadValidationResult> {
  const parentFolderId = sanitizeDriveId(input.parentFolderIdRaw)
  if (!parentFolderId) {
    return { ok: false, status: 400, error: 'parentFolderId inválido' }
  }

  const reason = input.reasonRaw.trim()
  const minReason = await getMinReasonLength()
  if (reason.length < minReason) {
    return { ok: false, status: 400, error: `reason debe tener al menos ${minReason} caracteres` }
  }

  const parsedClassification = parseClassificationInput(input.classificationRaw)
  if (!parsedClassification.ok) {
    return { ok: false, status: 400, error: parsedClassification.error }
  }

  if (input.fileSize <= 0) {
    return { ok: false, status: 400, error: 'fileSize inválido' }
  }

  if (input.fileSize > STAGING_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      error: `El archivo supera el límite máximo de ${formatUploadSizeLimit(STAGING_UPLOAD_MAX_BYTES)}`,
      code: 'upload_too_large',
    }
  }

  const name = input.fileName.trim().slice(0, 255)
  if (!name) {
    return { ok: false, status: 400, error: 'fileName inválido' }
  }

  const mimeType = normalizeUploadMime(input.mimeType, name)

  if (!input.allowOffice && isOfficeUploadMime(mimeType)) {
    return {
      ok: false,
      status: 409,
      error: 'Los archivos Office requieren aprobación previa del jefe de área',
      code: 'office_requires_approval',
    }
  }

  const driveSubject = resolveDriveSubject(input.user)
  const parent = await getFileInSharedDrive(parentFolderId, driveSubject)
  if (!parent.ok) {
    return { ok: false, status: parent.status, error: parent.error }
  }
  if (parent.file.trashed) {
    return { ok: false, status: 400, error: 'La carpeta destino está en la papelera' }
  }
  if (parent.file.mimeType !== FOLDER_MIME) {
    return { ok: false, status: 400, error: 'parentFolderId no es una carpeta' }
  }

  const governingAreaId = await resolveGoverningAreaId(parentFolderId)
  const isInstaller = isInstallerFilename(name)

  if (isInstaller) {
    const installerCheck = validateInstallerUpload(mimeType, name)
    if (!installerCheck.ok) {
      return {
        ok: false,
        status: 403,
        error: installerCheck.error,
        code: installerCheck.code,
      }
    }
    if (!isInstallerArea(governingAreaId)) {
      return {
        ok: false,
        status: 403,
        error: 'Los instaladores solo pueden subirse dentro del área Sistemas',
        code: 'installer_area_restricted',
      }
    }
  } else if (!isInstaller) {
    const allowedMimes = await getAllowedUploadMimeTypes()
    if (!isAllowedBinaryUploadMime(mimeType)) {
      return {
        ok: false,
        status: 403,
        error: 'mimeType no permitido para upload',
        allowedMimeTypes: [...new Set([...allowedMimes, ...BINARY_UPLOAD_MIMES])].sort(),
      }
    }
  }

  return {
    ok: true,
    value: {
      parentFolderId,
      reason,
      classification: parsedClassification.classification,
      governingAreaId,
      name,
      mimeType,
      isInstaller,
      driveSubject,
    },
  }
}
