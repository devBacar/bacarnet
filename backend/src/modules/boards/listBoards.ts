import type { Request, Response } from 'express'
import { getDrive } from '../../lib/google/driveClient.js'
import { logError } from '../../lib/log.js'
import { googleStatus } from '../drive/assertInSharedDrive.js'
import { getAccessibleBoardIds, isSuperAdminUser, syncBoardName } from './boardAccess.js'
import { boardsFeatureConfigured } from './policy.js'
import { getRrhhBoardFolderId } from '../rrhh/boardRrhhConfig.js'
import { getBoardsConfig } from './policy.js'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

export async function listBoards(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  if (!boardsFeatureConfigured()) {
    res.status(503).json({ error: 'Tableros no configurados' })
    return
  }

  const { containerFolderId } = getBoardsConfig()
  const superAdmin = isSuperAdminUser(user)
  const accessibleIds = superAdmin ? null : await getAccessibleBoardIds(user.uid)

  if (!superAdmin && accessibleIds!.size === 0) {
    res.json({ containerFolderId, boards: [] })
    return
  }

  try {
    const drive = await getDrive()
    const listed = await drive.files.list({
      q: `'${containerFolderId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
      fields: 'files(id, name, modifiedTime)',
      orderBy: 'name_natural',
      pageSize: 50,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    const boards = (listed.data.files ?? [])
      .filter((file) => Boolean(file.id && file.name))
      .filter((file) => superAdmin || accessibleIds!.has(file.id!))
      .map((file) => ({
        id: file.id!,
        name: file.name!,
        modifiedTime: file.modifiedTime ?? null,
        entryPath: 'index.html',
        // Tableros React (no HTML de Drive): el frontend los abre en su propia ruta.
        ...(file.id === getRrhhBoardFolderId() ? { tipo: 'rrhh' as const } : {}),
      }))

    await Promise.all(boards.map((board) => syncBoardName(board.id, board.name)))

    res.json({ containerFolderId, boards })
  } catch (err) {
    logError('Drive files.list (boards) falló', err)
    const status = googleStatus(err)
    res.status(status === 403 ? 403 : 502).json({ error: 'No se pudo listar los tableros' })
  }
}
