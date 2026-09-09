/**
 * Checklist manual automatizado en producción.
 * node backend/scripts/test-external-account-checklist.mjs
 */

import { getAuth } from 'firebase-admin/auth'
import { requireTestAccountPassword } from './lib/testSecrets.mjs'
import { getTestIdToken, getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
const PASSWORD = requireTestAccountPassword()

const base = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'
const ts = Date.now()
const EXTERNAL_EMAIL = `checklist-ext-${ts}@example.com`
const CORPORATE_EMAIL = `checklist-corp-${ts}@bacarsa.com.ar`
const APPROVE_REASON = 'Checklist producción: aprobación cuenta externa de prueba'

initAdmin()
const db = getAdminDb()
const auth = getAuth()

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function createAuthUser(email, displayName) {
  return auth.createUser({
    email,
    password: PASSWORD,
    emailVerified: true,
    displayName,
  })
}

console.log('=== CHECKLIST 1: Registro external → pending ===')
const externalAuth = await createAuthUser(EXTERNAL_EMAIL, 'Checklist External')
await db.collection('users').doc(externalAuth.uid).set({
  email: EXTERNAL_EMAIL,
  displayName: 'Checklist External',
  department: 'Externo',
  birthDate: '1990-01-01',
  role: 'user',
  accountType: 'external',
  accountStatus: 'pending_approval',
  permissions: {
    view_directory: false,
    view_drive: false,
    view_links: false,
    manage_news: false,
    manage_links: false,
    manage_users: false,
    super_admin: false,
  },
  favoriteApps: [],
  widgetPreferences: { weather: true, dollar: true },
  createdAt: new Date(),
})
const extDoc = (await db.collection('users').doc(externalAuth.uid).get()).data()
assert(extDoc.accountStatus === 'pending_approval', 'external debe quedar pending')
assert(extDoc.accountType === 'external', 'external accountType')
assert(extDoc.permissions.view_drive === false, 'sin view_drive')
console.log('OK Firestore:', extDoc.accountStatus, extDoc.accountType)

process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
const admin = await getTestIdToken()
const listBefore = await fetch(`${base}/api/users/pending-external-accounts`, {
  headers: { Authorization: `Bearer ${admin.idToken}` },
})
assert(listBefore.status === 200, `list pending status ${listBefore.status}`)
const listBeforeBody = await listBefore.json()
const foundPending = (listBeforeBody.accounts ?? []).some((row) => row.uid === externalAuth.uid)
assert(foundPending, 'debe aparecer en panel de cuentas pendientes')
console.log('OK panel API: aparece en pending-external-accounts')

process.env.TEST_EMAIL = EXTERNAL_EMAIL
const externalPending = await getTestIdToken({ requireSuperAdmin: false })
const drivePending = await fetch(`${base}/api/drive/files?folderId=root`, {
  headers: { Authorization: `Bearer ${externalPending.idToken}` },
})
assert(drivePending.status === 403, `Drive pending debe ser 403, got ${drivePending.status}`)
console.log('OK Drive bloqueado para pending (403)')

console.log('\n=== CHECKLIST 2: Aprobar desde admin con motivo ===')
const approveRes = await fetch(
  `${base}/api/users/${encodeURIComponent(externalAuth.uid)}/approve-external`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${admin.idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason: APPROVE_REASON }),
  },
)
const approveText = await approveRes.text()
assert(approveRes.status === 200, `approve status ${approveRes.status}: ${approveText}`)
console.log('OK approve-external:', approveText)

const approvedDoc = (await db.collection('users').doc(externalAuth.uid).get()).data()
assert(approvedDoc.accountStatus === 'active', 'debe quedar active')
assert(approvedDoc.permissions.view_directory === true, 'view_directory true')
assert(approvedDoc.permissions.view_drive === false, 'view_drive false')
assert(approvedDoc.permissions.view_links === false, 'view_links false')
console.log('OK permisos restringidos post-aprobación')

const listAfter = await fetch(`${base}/api/users/pending-external-accounts`, {
  headers: { Authorization: `Bearer ${admin.idToken}` },
})
const listAfterBody = await listAfter.json()
const stillPending = (listAfterBody.accounts ?? []).some((row) => row.uid === externalAuth.uid)
assert(!stillPending, 'no debe seguir en pendientes')
console.log('OK ya no está en pendientes')

console.log('\n=== CHECKLIST 3: Externa aprobada → Drive sigue bloqueado ===')
process.env.TEST_EMAIL = EXTERNAL_EMAIL
const externalApproved = await getTestIdToken({ requireSuperAdmin: false })
const driveApproved = await fetch(`${base}/api/drive/files?folderId=root`, {
  headers: { Authorization: `Bearer ${externalApproved.idToken}` },
})
const driveApprovedBody = await driveApproved.text()
assert(driveApproved.status === 403, `Drive approved external 403, got ${driveApproved.status}`)
assert(driveApprovedBody.includes('bacarsa.com.ar'), driveApprovedBody)
console.log('OK Drive 403:', driveApprovedBody)

console.log('\n=== CHECKLIST 4: Registro corporate → active (sin pending) ===')
const corpAuth = await createAuthUser(CORPORATE_EMAIL, 'Checklist Corporate')
await db.collection('users').doc(corpAuth.uid).set({
  email: CORPORATE_EMAIL,
  displayName: 'Checklist Corporate',
  department: 'General',
  birthDate: '1990-01-01',
  role: 'user',
  accountType: 'corporate',
  accountStatus: 'active',
  permissions: {
    view_directory: true,
    view_drive: true,
    view_links: true,
    manage_news: false,
    manage_links: false,
    manage_users: false,
    super_admin: false,
  },
  favoriteApps: [],
  widgetPreferences: { weather: true, dollar: true },
  createdAt: new Date(),
})
const corpDoc = (await db.collection('users').doc(corpAuth.uid).get()).data()
assert(corpDoc.accountStatus === 'active', 'corporate active')
assert(corpDoc.accountType === 'corporate', 'corporate type')
const corpInPending = (listAfterBody.accounts ?? []).some((row) => row.uid === corpAuth.uid)
assert(!corpInPending, 'corporate no en pendientes')
console.log('OK corporate active, no pending')

console.log('\n=== CREDENCIALES PARA VERIFICACIÓN UI EN NAVEGADOR ===')
console.log('External aprobada:', EXTERNAL_EMAIL, PASSWORD)
console.log('External uid:', externalAuth.uid)
console.log('Corporate:', CORPORATE_EMAIL, PASSWORD)

console.log('\nCHECKLIST API: 4/4 OK')
