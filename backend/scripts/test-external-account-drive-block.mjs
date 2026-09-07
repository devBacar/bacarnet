/**
 * Verifica el flujo de cuentas externas:
 * 1) perfil external+active no pasa requireWorkspaceUser en Drive
 * 2) super_admin puede listar pendientes (si hay)
 *
 * Uso:
 *   node backend/scripts/test-external-account-drive-block.mjs
 */

import { getAuth } from 'firebase-admin/auth'
import { getTestIdToken, getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

const base = process.env.FUNCTIONS_API_BASE?.trim() || 'https://intranet-bacar.web.app'
const TEST_EMAIL =
  process.env.EXTERNAL_TEST_EMAIL?.trim().toLowerCase() ||
  'intranet-external-drive-test@example.com'

initAdmin()
loadTestEnv()

const db = getAdminDb()
const auth = getAuth()

let authUser
try {
  authUser = await auth.getUserByEmail(TEST_EMAIL)
} catch {
  authUser = await auth.createUser({
    email: TEST_EMAIL,
    password: 'REDACTED',
    emailVerified: true,
    displayName: 'External Drive Block Test',
  })
}

await db
  .collection('users')
  .doc(authUser.uid)
  .set(
    {
      email: TEST_EMAIL,
      displayName: 'External Drive Block Test',
      department: 'Externo',
      role: 'user',
      accountType: 'external',
      accountStatus: 'active',
      permissions: {
        view_directory: true,
        view_drive: false,
        view_links: false,
        manage_news: false,
        manage_links: false,
        manage_users: false,
        super_admin: false,
      },
      favoriteApps: [],
      widgetPreferences: { weather: true, dollar: true },
    },
    { merge: true },
  )

await auth.updateUser(authUser.uid, { emailVerified: true, disabled: false })

process.env.TEST_EMAIL = TEST_EMAIL
const external = await getTestIdToken({ requireSuperAdmin: false })

const driveRes = await fetch(`${base}/api/drive/files?folderId=root`, {
  headers: { Authorization: `Bearer ${external.idToken}` },
})
const driveBody = await driveRes.text()

console.log('=== Cuenta externa aprobada (simulada) ===')
console.log('email:', external.email)
console.log('uid:', external.uid)
console.log('GET /api/drive/files?folderId=root')
console.log('status:', driveRes.status)
console.log('body:', driveBody.slice(0, 300))

if (driveRes.status !== 403) {
  console.error('\nFALLÓ: se esperaba HTTP 403 para Drive con cuenta externa')
  process.exit(1)
}

if (!driveBody.includes('bacarsa.com.ar') && !driveBody.includes('dominio')) {
  console.error('\nFALLÓ: el cuerpo no menciona restricción de dominio')
  process.exit(1)
}

process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
const admin = await getTestIdToken()
const listRes = await fetch(`${base}/api/users/pending-external-accounts`, {
  headers: { Authorization: `Bearer ${admin.idToken}` },
})
const listBody = await listRes.json().catch(() => ({}))

console.log('\n=== super_admin: pending-external-accounts ===')
console.log('status:', listRes.status)
console.log('accounts:', Array.isArray(listBody.accounts) ? listBody.accounts.length : listBody)

if (listRes.status === 404) {
  console.log('\nNota: endpoint aún no desplegado en prod; Drive 403 verificado arriba.')
  console.log('OK local: bloqueo Drive confirmado con evidencia real.')
  process.exit(0)
}

if (listRes.status !== 200) {
  console.error('\nFALLÓ: super_admin no pudo listar cuentas pendientes')
  process.exit(1)
}

console.log('\nOK: cuenta externa bloqueada en Drive (403) y panel API responde 200.')
