import { Router } from 'express'
import { requireViewDrive, requireWorkspaceUser } from '../auth/middleware.js'
import { approveAccessRequest } from './approveAccessRequest.js'
import { createAccessRequest } from './createAccessRequest.js'
import { createOfficeUploadRequest } from './createOfficeUploadRequest.js'
import { getOfficeUploadStagingPreview } from './getOfficeUploadStagingPreview.js'
import { rejectAccessRequest } from './rejectAccessRequest.js'

export const approvalRequestsRouter = Router()

approvalRequestsRouter.use(requireWorkspaceUser, requireViewDrive)

approvalRequestsRouter.post('/access', createAccessRequest)
approvalRequestsRouter.post('/office-upload', createOfficeUploadRequest)
approvalRequestsRouter.get('/:requestId/staging-preview', getOfficeUploadStagingPreview)
approvalRequestsRouter.post('/:requestId/approve', approveAccessRequest)
approvalRequestsRouter.post('/:requestId/reject', rejectAccessRequest)
