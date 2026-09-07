import cors from 'cors'
import express from 'express'
import { auditRouter } from './modules/audit/routes.js'
import { boardsRouter } from './modules/boards/routes.js'
import { driveRouter } from './modules/drive/routes.js'
import { usersRouter } from './modules/users/routes.js'
import { notificationsRouter } from './modules/notifications/routes.js'
import { approvalRequestsRouter } from './modules/approvalRequests/routes.js'
import {
  handleOfficeUploadStagingContentPreflight,
  serveOfficeUploadStagingContent,
} from './modules/approvalRequests/serveOfficeUploadStagingContent.js'

const app = express()

app.disable('x-powered-by')

/** Office Online fetchea staging desde el navegador (origin officeapps.live.com). Antes de CORS restrictivo. */
app.options('/api/approval-requests/:requestId/staging-content', handleOfficeUploadStagingContentPreflight)
app.get('/api/approval-requests/:requestId/staging-content', serveOfficeUploadStagingContent)

app.use(express.json({ limit: '1mb' }))
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://intranet-bacar.web.app',
      'https://intranet-bacar.firebaseapp.com',
    ],
    credentials: true,
  }),
)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/drive', driveRouter)
app.use('/api/boards', boardsRouter)
app.use('/api/audit', auditRouter)
app.use('/api/users', usersRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/approval-requests', approvalRequestsRouter)

app.use((_req, res) => {
  res.status(404).json({ error: 'No encontrado' })
})

export { app }
