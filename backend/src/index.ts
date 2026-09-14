import { defineSecret } from 'firebase-functions/params'
import { setGlobalOptions } from 'firebase-functions/v2'
import { onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import type { Request, Response } from 'express'
import { initFirebaseAdmin } from './lib/firebase/admin.js'
import { logCredentialDiagnostics } from './lib/diag.js'

const boardsSessionSecret = defineSecret('BOARDS_SESSION_SECRET')
const helpdeskTokenSecret = defineSecret('HELPDESK_TOKEN_SECRET')
const helpdeskN8nApiKey = defineSecret('HELPDESK_N8N_API_KEY')
const helpdeskN8nOutboundApiKey = defineSecret('HELPDESK_N8N_OUTBOUND_API_KEY')
const helpdeskN8nWebhookSolicitudCreada = defineSecret('HELPDESK_N8N_WEBHOOK_SOLICITUD_CREADA')
const helpdeskN8nWebhookEstadoCambiado = defineSecret(
  'HELPDESK_N8N_WEBHOOK_' + 'ESTADO_CAMBIADO',
)
const n8nMgmtApiKey = defineSecret('N8N_MGMT_API_KEY')
const helpdeskN8nWebhookRecordatorio = defineSecret(
  'HELPDESK_N8N_WEBHOOK_' + 'RECORDATORIO',
)

const adminMode = initFirebaseAdmin()
logCredentialDiagnostics(adminMode)

/** Runtime SA de Cloud Functions: misma cuenta que Drive+DWD en local (`datos-drive-sa.json`). */
const DRIVE_RUNTIME_SA = 'datos-drive-sa@bacar-web.iam.gserviceaccount.com'

setGlobalOptions({
  region: 'southamerica-east1',
  maxInstances: 10,
  serviceAccount: DRIVE_RUNTIME_SA,
})

type ExpressApp = (req: Request, res: Response) => void

let appPromise: Promise<ExpressApp> | null = null

/** Carga perezosa: el análisis de deploy de Firebase importa index sin montar Express/googleapis. */
function loadApp(): Promise<ExpressApp> {
  if (!appPromise) {
    appPromise = import('./server.js').then((mod) => mod.app)
  }
  return appPromise
}

export const api = onRequest(
  {
    cors: false,
    timeoutSeconds: 900,
    memory: '2GiB',
    invoker: 'public',
    secrets: [
      boardsSessionSecret,
      helpdeskTokenSecret,
      helpdeskN8nApiKey,
      helpdeskN8nOutboundApiKey,
      helpdeskN8nWebhookSolicitudCreada,
      helpdeskN8nWebhookEstadoCambiado,
    ],
  },
  async (req, res) => {
    const app = await loadApp()
    app(req, res)
  },
)

export const sincronizarReunionesHelpdesk = onSchedule(
  {
    schedule: 'every 2 hours',
    timeZone: 'America/Argentina/Buenos_Aires',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    const { runScheduledReunionSync } = await import(
      './modules/helpdesk/scheduledReunionSync.js'
    )
    await runScheduledReunionSync()
  },
)

export const recordarSolicitudesHelpdesk = onSchedule(
  {
    schedule: 'every day 09:00',
    timeZone: 'America/Argentina/Buenos_Aires',
    timeoutSeconds: 300,
    memory: '256MiB',
    secrets: [n8nMgmtApiKey, helpdeskN8nOutboundApiKey, helpdeskN8nWebhookRecordatorio],
  },
  async () => {
    const { runScheduledReminder } = await import(
      './modules/helpdesk/scheduledReminder.js'
    )
    await runScheduledReminder()
  },
)

// Trigger Firestore pendiente de IAM Eventarc en prod; pendingUserSetup usa POST /api/users/apply-pending-setup.
// export { applyPendingUserSetup } from './triggers/onUserCreated.js'
