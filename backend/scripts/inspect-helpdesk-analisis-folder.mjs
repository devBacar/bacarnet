/**
 * Inspecciona permisos de la carpeta "Proyectos - análisis".
 *
 *   node backend/scripts/inspect-helpdesk-analisis-folder.mjs
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTestEnv, initAdmin } from './get-test-token.mjs'

const FOLDER_ID = '1SUza1HVVaLOR5GPyeDXlxDMpYue5NYvL'

loadTestEnv()
initAdmin()

const { getEnv } = await import('../lib/config/env.js')
const { getDrive } = await import('../lib/lib/google/driveClient.js')

const env = getEnv()
const drive = await getDrive(env.driveImpersonateEmail)

const meta = await drive.files.get({
  fileId: FOLDER_ID,
  supportsAllDrives: true,
  fields: 'id, name, mimeType, driveId, capabilities',
})

const listed = await drive.permissions.list({
  fileId: FOLDER_ID,
  supportsAllDrives: true,
  fields: 'permissions(id,type,role,emailAddress,domain,allowFileDiscovery)',
})

console.log('Carpeta:', meta.data.name, meta.data.id)
console.log('Capabilities:', JSON.stringify(meta.data.capabilities, null, 2))
console.log('Permisos directos:')
for (const p of listed.data.permissions ?? []) {
  console.log(
    ` - ${p.type} ${p.role} ${p.emailAddress ?? p.domain ?? ''} discovery=${p.allowFileDiscovery ?? 'n/a'}`,
  )
}
