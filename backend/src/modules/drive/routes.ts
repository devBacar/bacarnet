import { Router } from 'express'
import { requireViewDrive, requireWorkspaceUser } from '../auth/middleware.js'
import { createAuthorizedCopy } from './authorizedCopy.js'
import { createDriveFile } from './createFile.js'
import { getDriveFile } from './getFile.js'
import { grantDriveAreaPermission } from './grantAreaPermission.js'
import { grantDrivePermission } from './grantPermission.js'
import { listDriveFiles } from './listFiles.js'
import { listDrivePermissions } from './listPermissions.js'
import { revokeDrivePermission } from './revokePermission.js'
import { moveDriveFile } from './moveFile.js'
import { renameDriveFile } from './renameFile.js'
import { trashDriveFile } from './trashFile.js'
import { updateDriveFileClassification } from './updateClassification.js'
import { updateDriveFileStatus } from './updateStatus.js'
import { uploadDriveFile } from './uploadFile.js'

export const driveRouter = Router()

driveRouter.use(requireWorkspaceUser, requireViewDrive)

driveRouter.get('/files', listDriveFiles)
driveRouter.get('/files/:fileId', getDriveFile)
driveRouter.post('/files', createDriveFile)
driveRouter.post('/files/upload', uploadDriveFile)
driveRouter.post('/files/:fileId/trash', trashDriveFile)
driveRouter.patch('/files/:fileId/rename', renameDriveFile)
driveRouter.post('/files/:fileId/move', moveDriveFile)
driveRouter.patch('/files/:fileId/classification', updateDriveFileClassification)
driveRouter.patch('/files/:fileId/status', updateDriveFileStatus)
driveRouter.get('/files/:fileId/permissions', listDrivePermissions)
driveRouter.post('/files/:fileId/permissions/area', grantDriveAreaPermission)
driveRouter.post('/files/:fileId/permissions', grantDrivePermission)
driveRouter.post('/files/:fileId/permissions/:permissionId/revoke', revokeDrivePermission)
driveRouter.post('/files/:fileId/authorized-copy', createAuthorizedCopy)
