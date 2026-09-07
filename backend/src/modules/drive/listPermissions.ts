import type { Request, Response } from 'express'
import { adminDb } from '../../lib/firebase/admin.js'
import { getDrive } from '../../lib/google/driveClient.js'
import { sanitizeDriveId } from '../../lib/google/driveIds.js'
import { logError } from '../../lib/log.js'
import { getFileInSharedDrive, googleStatus, googleUserMessage } from './assertInSharedDrive.js'
import { getStoredClassification, type FileClassification } from './classification.js'
import {
  canPerformGovernanceAction,
  governanceForbiddenMessage,
  resolveFileGoverningAreaId,
} from './governDriveFile.js'
import { getAreaDisplayName, resolveAreaMembers } from './resolveAreaMembers.js'
import {
  isPrivilegedPermissionEmail,
  resolvePrivilegedPermissionEmails,
} from './privilegedPermissionEmails.js'

type ApiPermissionRole = 'reader' | 'writer' | 'commenter'

function toApiRole(driveRole: string | null | undefined): ApiPermissionRole {
  if (driveRole === 'fileOrganizer' || driveRole === 'writer') return 'writer'
  if (driveRole === 'commenter') return 'commenter'
  return 'reader'
}

import { isInheritedPermission } from './driveUserPermission.js'

export async function listDrivePermissions(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const fileId = sanitizeDriveId(String(req.params.fileId ?? ''))
  if (!fileId) {
    res.status(400).json({ error: 'fileId inválido' })
    return
  }

  const found = await getFileInSharedDrive(fileId)
  if (!found.ok) {
    res.status(found.status).json({ error: found.error })
    return
  }

  const governingAreaId = await resolveFileGoverningAreaId(fileId, found.file.parentFolderId)
  if (!canPerformGovernanceAction(user, 'permission_grant', governingAreaId)) {
    res.status(403).json({ error: governanceForbiddenMessage('permission_grant') })
    return
  }

  const classification: FileClassification = await getStoredClassification(fileId)
  const areaName = governingAreaId ? await getAreaDisplayName(governingAreaId) : null
  const areaMembers = governingAreaId ? await resolveAreaMembers(governingAreaId) : []
  const sidecarSnap = await adminDb().collection('driveFiles').doc(fileId).get()
  const createdByEmail =
    sidecarSnap.exists && typeof sidecarSnap.get('createdByEmail') === 'string'
      ? sidecarSnap.get('createdByEmail').trim()
      : null
  const createdByDisplayName =
    sidecarSnap.exists && typeof sidecarSnap.get('createdByDisplayName') === 'string'
      ? sidecarSnap.get('createdByDisplayName').trim()
      : null

  try {
    const drive = await getDrive()
    const permissions: Array<{
      id: string
      type: 'user'
      emailAddress: string
      displayName: string | null
      role: ApiPermissionRole
      driveRole: string
      inherited: boolean
    }> = []

    let domainAccess: {
      id: string
      role: ApiPermissionRole
      driveRole: string
      domain: string
      inherited: boolean
    } | null = null

    let pageToken: string | undefined
    do {
      const listed = await drive.permissions.list({
        fileId,
        supportsAllDrives: true,
        fields:
          'nextPageToken, permissions(id, type, role, emailAddress, domain, displayName, permissionDetails)',
        pageSize: 100,
        pageToken,
      })

      for (const permission of listed.data.permissions ?? []) {
        if (!permission.id) continue
        const inherited = isInheritedPermission(permission.permissionDetails)
        const apiRole = toApiRole(permission.role)

        if (permission.type === 'user' && permission.emailAddress) {
          permissions.push({
            id: permission.id,
            type: 'user',
            emailAddress: permission.emailAddress.trim().toLowerCase(),
            displayName: permission.displayName?.trim() || null,
            role: apiRole,
            driveRole: permission.role ?? apiRole,
            inherited,
          })
          continue
        }

        if (permission.type === 'domain' && permission.domain && !domainAccess) {
          domainAccess = {
            id: permission.id,
            role: apiRole,
            driveRole: permission.role ?? apiRole,
            domain: permission.domain,
            inherited,
          }
        }
      }

      pageToken = listed.data.nextPageToken ?? undefined
    } while (pageToken)

    permissions.sort((a, b) => a.emailAddress.localeCompare(b.emailAddress, 'es'))

    const privilegedEmails = await resolvePrivilegedPermissionEmails()
    const visiblePermissions = permissions.filter(
      (entry) => !isPrivilegedPermissionEmail(entry.emailAddress, privilegedEmails),
    )

    res.json({
      fileId,
      fileName: found.file.name,
      isFolder: found.file.mimeType === 'application/vnd.google-apps.folder',
      classification,
      governingAreaId,
      governingAreaName: areaName,
      areaMembers,
      permissions: visiblePermissions,
      domainAccess,
      createdByEmail,
      createdByDisplayName,
    })
  } catch (err) {
    logError('Drive permissions.list falló', err)
    const status = googleStatus(err)
    const detail = googleUserMessage(err)
    res.status(status === 403 || status === 404 ? status : 502).json({
      error: 'No se pudo listar los permisos',
      ...(detail ? { detail } : {}),
    })
  }
}
