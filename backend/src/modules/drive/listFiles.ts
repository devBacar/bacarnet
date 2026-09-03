import type { Request, Response } from 'express'
import { getDrive } from '../../lib/google/driveClient.js'
import { getSharedDriveQuery, getSharedDriveRootId } from '../../lib/google/sharedDrive.js'
import { sanitizeDriveId } from '../../lib/google/driveIds.js'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import { googleStatus, googleUserMessage } from './assertInSharedDrive.js'
import {
  DEFAULT_CLASSIFICATION,
  DEFAULT_STATUS,
  isFileClassification,
  isFileStatus,
} from './classification.js'
import {
  getAreaNamesByIds,
  getCachedRootProbeExtras,
  getCachedRootSharedFiles,
  getDriveFolderMappings,
} from './driveMetadataCache.js'
import { listRootOrphanSharedFiles } from './listRootOrphanSharedFiles.js'
import { resolveDriveSubject } from './driveSubject.js'
import { resolveGoverningAreaId } from './resolveGoverningArea.js'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const FILE_FIELDS =
  'nextPageToken, files(id, name, mimeType, parents, modifiedTime, createdTime, size, iconLink, webViewLink, shortcutDetails, lastModifyingUser(displayName,emailAddress), capabilities(canTrash,canEdit,canShare,canAddChildren))'

function resolveFolderId(queryValue: unknown): string | null {
  const driveRoot = getSharedDriveRootId()
  if (queryValue === undefined || queryValue === null || String(queryValue).trim() === '') {
    return driveRoot
  }
  const id = sanitizeDriveId(String(queryValue))
  if (!id) return null
  if (id === 'root') return driveRoot
  return id
}

export async function listDriveFiles(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const folderId = resolveFolderId(req.query.folderId)
  if (!folderId) {
    res.status(400).json({ error: 'folderId inválido' })
    return
  }

  const pageToken =
    typeof req.query.pageToken === 'string' && req.query.pageToken.length > 0
      ? req.query.pageToken
      : undefined

  try {
    const driveSubject = resolveDriveSubject(user)
    const drive = await getDrive(driveSubject)
    const shared = getSharedDriveQuery()
    const result = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: FILE_FIELDS,
      pageSize: 100,
      pageToken,
      orderBy: 'folder,name',
      ...shared,
    })

    let driveFiles = result.data.files ?? []
    let directAccessIds = new Set<string>()

    // Los no-miembros de una Unidad compartida pueden abrir una carpeta otorgada
    // directamente, pero Drive no siempre la devuelve al listar la raíz. Usamos
    // los IDs de mapeo como índice y conservamos solo los que el usuario puede leer.
    if (folderId === getSharedDriveRootId()) {
      const mappings = await getDriveFolderMappings()
      const knownIds = new Set(driveFiles.map((file) => file.id).filter(Boolean))
      const probed = await getCachedRootProbeExtras(driveSubject, user.uid, async () => {
        const results = await Promise.all(
          mappings
            .filter((mapping) => !knownIds.has(mapping.id))
            .map(async (mapping) => {
              try {
                const meta = await drive.files.get({
                  fileId: mapping.id,
                  supportsAllDrives: true,
                  fields:
                    'id, name, mimeType, parents, modifiedTime, createdTime, size, iconLink, webViewLink, shortcutDetails, lastModifyingUser(displayName,emailAddress), capabilities(canTrash,canEdit,canShare,canAddChildren)',
                })
                return meta.data
              } catch (err) {
                const status = googleStatus(err)
                if (status === 403 || status === 404) return null
                throw err
              }
            }),
        )
        return results.filter((file): file is NonNullable<typeof file> => file !== null)
      })
      driveFiles = [
        ...driveFiles,
        ...probed,
      ].sort((a, b) => {
        const folderDelta =
          Number(b.mimeType === FOLDER_MIME) - Number(a.mimeType === FOLDER_MIME)
        return folderDelta || (a.name ?? '').localeCompare(b.name ?? '', 'es')
      })

      const knownAfterProbe = new Set(
        driveFiles.map((file) => file.id).filter((id): id is string => Boolean(id)),
      )
      const sharedOrphans = await getCachedRootSharedFiles(
        driveSubject,
        user.uid,
        async () => listRootOrphanSharedFiles(drive, folderId, knownAfterProbe),
      )
      if (sharedOrphans.length > 0) {
        for (const file of sharedOrphans) {
          if (file.id) directAccessIds.add(file.id)
        }
        driveFiles = [...driveFiles, ...sharedOrphans].sort((a, b) => {
          const folderDelta =
            Number(b.mimeType === FOLDER_MIME) - Number(a.mimeType === FOLDER_MIME)
          return folderDelta || (a.name ?? '').localeCompare(b.name ?? '', 'es')
        })
      }
    }
    const sidecars = driveFiles.length
      ? await adminDb().getAll(
          ...driveFiles.map((file) =>
            adminDb().collection('driveFiles').doc(file.id ?? '__missing__'),
          ),
        )
      : []
    const sidecarById = new Map(sidecars.map((snap) => [snap.id, snap]))

    const driveRoot = getSharedDriveRootId()
    const inheritedAreaId =
      folderId === driveRoot ? undefined : await resolveGoverningAreaId(folderId)
    const areaIds = await Promise.all(
      driveFiles.map(async (file) => {
        const sidecar = file.id ? sidecarById.get(file.id) : undefined
        const storedAreaId = sidecar?.exists ? sidecar.get('governingAreaId') : undefined
        if (typeof storedAreaId === 'string' && storedAreaId.length > 0) {
          return storedAreaId
        }
        if (storedAreaId === null) return null
        if (inheritedAreaId !== undefined) return inheritedAreaId
        if (file.mimeType !== FOLDER_MIME && file.parents?.[0]) {
          return resolveGoverningAreaId(file.parents[0])
        }
        if (file.mimeType !== FOLDER_MIME || !file.id) return null
        return resolveGoverningAreaId(file.id)
      }),
    )
    const uniqueAreaIds = [...new Set(areaIds.filter((id): id is string => Boolean(id)))]
    const areaNameById = await getAreaNamesByIds(uniqueAreaIds)

    const files = driveFiles.map((file, index) => {
      const id = file.id ?? ''
      const isFolder = file.mimeType === FOLDER_MIME
      const sidecar = sidecarById.get(id)
      const rawClassification = sidecar?.exists ? sidecar.get('classification') : undefined
      const rawStatus = sidecar?.exists ? sidecar.get('status') : undefined
      const areaId = areaIds[index] ?? null
      const areaName = areaId ? areaNameById.get(areaId) ?? areaId : null
      const storedCreatorName =
        sidecar?.exists && typeof sidecar.get('createdByDisplayName') === 'string'
          ? sidecar.get('createdByDisplayName').trim()
          : ''
      const storedCreatorEmail =
        sidecar?.exists && typeof sidecar.get('createdByEmail') === 'string'
          ? sidecar.get('createdByEmail').trim()
          : ''
      const fallbackCreatorName = file.lastModifyingUser?.displayName?.trim() ?? ''
      const fallbackCreatorEmail = file.lastModifyingUser?.emailAddress?.trim() ?? ''
      const creatorName =
        storedCreatorName || storedCreatorEmail || fallbackCreatorName || fallbackCreatorEmail || null
      const creatorEmail = storedCreatorEmail || fallbackCreatorEmail || null

      return {
        id,
        name: file.name ?? '',
        mimeType: file.mimeType ?? '',
        parents: file.parents ?? [],
        modifiedTime: file.modifiedTime ?? null,
        createdTime: file.createdTime ?? null,
        size: file.size ?? null,
        iconLink: file.iconLink ?? null,
        webViewLink: file.webViewLink ?? null,
        isFolder,
        capabilities: {
          canTrash: file.capabilities?.canTrash === true,
          canEdit: file.capabilities?.canEdit === true,
          canShare: file.capabilities?.canShare === true,
          canAddChildren: file.capabilities?.canAddChildren === true,
        },
        classification: isFolder
          ? null
          : isFileClassification(rawClassification)
            ? rawClassification
            : DEFAULT_CLASSIFICATION,
        status: isFolder
          ? null
          : isFileStatus(rawStatus)
            ? rawStatus
            : DEFAULT_STATUS,
        governingAreaId: areaId,
        governingAreaName: areaName,
        creator: {
          displayName: creatorName,
          email: creatorEmail,
          source: storedCreatorName || storedCreatorEmail ? 'intranet' : 'last_modifying_user',
        },
        ownerLabel: isFolder
          ? areaName ?? 'Sin área'
          : `${areaName ?? 'Sin área'} - ${creatorName ?? 'Creador desconocido'}`,
        directAccess: directAccessIds.has(id) ? true : undefined,
      }
    })

    res.json({
      folderId,
      files,
      nextPageToken: result.data.nextPageToken ?? null,
    })
  } catch (err) {
    // logError solo persiste name/code/status/message redactado: nunca config, JWT ni access_token
    logError('Drive files.list falló', err)
    const status = googleStatus(err)
    const detail = googleUserMessage(err)
    res.status(status === 403 || status === 404 ? status : 502).json({
      error:
        status === 403
          ? 'No tenés permiso para ver esta carpeta'
          : status === 404
            ? 'Carpeta no encontrada o sin acceso'
            : 'No se pudo listar la carpeta de Drive',
      ...(detail ? { detail } : {}),
    })
  }
}
