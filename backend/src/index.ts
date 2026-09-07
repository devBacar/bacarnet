import { defineSecret } from 'firebase-functions/params'
import { setGlobalOptions } from 'firebase-functions/v2'
import { onRequest } from 'firebase-functions/v2/https'
import { initFirebaseAdmin } from './lib/firebase/admin.js'
import { logCredentialDiagnostics } from './lib/diag.js'
import { app } from './server.js'

const boardsSessionSecret = defineSecret('BOARDS_SESSION_SECRET')

const adminMode = initFirebaseAdmin()
logCredentialDiagnostics(adminMode)

/** Runtime SA de Cloud Functions: misma cuenta que Drive+DWD en local (`datos-drive-sa.json`). */
const DRIVE_RUNTIME_SA = 'datos-drive-sa@bacar-web.iam.gserviceaccount.com'

setGlobalOptions({
  region: 'southamerica-east1',
  maxInstances: 10,
  serviceAccount: DRIVE_RUNTIME_SA,
})

export const api = onRequest(
  {
    cors: false,
    timeoutSeconds: 60,
    memory: '256MiB',
    invoker: 'public',
    secrets: [boardsSessionSecret],
  },
  app,
)

// Trigger Firestore pendiente de IAM Eventarc en prod; pendingUserSetup usa POST /api/users/apply-pending-setup.
// export { applyPendingUserSetup } from './triggers/onUserCreated.js'
