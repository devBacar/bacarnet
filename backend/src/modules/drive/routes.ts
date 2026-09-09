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
import { prepareStagingUpload } from './prepareStagingUpload.js'
import { completeStagingUpload } from './completeStagingUpload.js'
import { askDriveRag } from '../rag/askDriveRag.js'
import { createAssistantCorrectionHandler } from '../rag/assistantCorrections.js'
import { getAssistantUsageStats } from '../rag/getAssistantUsageStats.js'
import { listAssistantInteractions } from '../rag/listAssistantInteractions.js'
import { submitAssistantInteractionFeedback } from '../rag/submitAssistantInteractionFeedback.js'
import { updateAssistantInteractionDevReview } from '../rag/updateAssistantInteractionDevReview.js'
import { getDriveRagStatus, reindexDriveRag } from '../rag/reindexDriveRag.js'
import {
  cancelAssistantAction,
  confirmAssistantAction,
} from '../assistant-actions/confirmAssistantAction.js'

export const driveRouter = Router()

driveRouter.use(requireWorkspaceUser, requireViewDrive)

driveRouter.get('/files', listDriveFiles)
driveRouter.get('/files/:fileId', getDriveFile)
driveRouter.post('/files', createDriveFile)
driveRouter.post('/files/upload', uploadDriveFile)
driveRouter.post('/files/upload/prepare', prepareStagingUpload)
driveRouter.post('/files/upload/complete', completeStagingUpload)
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
driveRouter.post('/ask', askDriveRag)
driveRouter.post('/assistant/actions/:actionId/confirm', confirmAssistantAction)
driveRouter.post('/assistant/actions/:actionId/cancel', cancelAssistantAction)
driveRouter.get('/rag/status', getDriveRagStatus)
driveRouter.post('/rag/reindex', reindexDriveRag)
driveRouter.get('/rag/interactions', listAssistantInteractions)
driveRouter.get('/rag/usage-stats', getAssistantUsageStats)
driveRouter.post('/rag/interactions/:interactionId/feedback', submitAssistantInteractionFeedback)
driveRouter.post(
  '/rag/interactions/:interactionId/dev-review',
  updateAssistantInteractionDevReview,
)
driveRouter.post('/rag/corrections', createAssistantCorrectionHandler)
