/**
 * Flujo local vía Admin SDK (sin UI):
 * 1) crea cuenta external pending
 * 2) verifica campos
 * 3) aprueba (misma forma que el backend)
 * 4) confirma permisos restringidos
 * 5) confirma Drive API → 403
 *
 * Uso: node backend/scripts/test-external-account-flow.mjs
 */

import { getAuth } from 'firebase-admin/auth'
import { getTestIdToken, getAdminDb, initAdmin } from './get-test-token.mjs'

const base = process.env.FUNCTIONS_API_BASE?.trim() || 'https://intranet-bacar.web.app'
const PENDING_EMAIL = 'intranet-external-pending-test@example.com'
const CORPORATE_EMAIL = 'intranet-corporate-reg-test@bacarsa.com.ar'

initAdmin()
const db = getAdminDb()
const auth = getAuth()

async function upsertAuthUser(email, displayName) {
  try {
    return await auth.getUserByEmail(email)
  } catch {
    return auth.createUser({
      email,
      password: 'REDACTED',
      emailVerified: true,
      displayName,
    })
  }
}

console.log('=== 1) Registro external → pending_approval ===')
const pendingAuth = await upsertAuthUser(PENDING_EMAIL, 'Pending External Test')
await db.collection('users').doc(pendingAuth.uid).set({
  email: PENDING_EMAIL,
  displayName: 'Pending External Test',
  department: 'Externo',
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
})
const pendingSnap = await db.collection('users').doc(pendingAuth.uid).get()
const pendingData = pendingSnap.data() ?? {}
console.log('accountType:', pendingData.accountType)
console.log('accountStatus:', pendingData.accountStatus)
console.log('permissions.view_drive:', pendingData.permissions?.view_drive)
if (pendingData.accountStatus !== 'pending_approval') {
  throw new Error('Expected pending_approval')
}

console.log('\n=== 2) Registro corporate → active (simulado) ===')
const corpAuth = await upsertAuthUser(CORPORATE_EMAIL, 'Corporate Reg Test')
await db.collection('users').doc(corpAuth.uid).set({
  email: CORPORATE_EMAIL,
  displayName: 'Corporate Reg Test',
  department: 'General',
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
})
const corpSnap = await db.collection('users').doc(corpAuth.uid).get()
const corpData = corpSnap.data() ?? {}
console.log('accountType:', corpData.accountType)
console.log('accountStatus:', corpData.accountStatus)
if (corpData.accountStatus !== 'active' || corpData.accountType !== 'corporate') {
  throw new Error('Expected corporate active')
}

console.log('\n=== 3) Aprobación super_admin (simulada en Firestore) ===')
await db.collection('users').doc(pendingAuth.uid).update({
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
  widgetPreferences: { weather: true, dollar: true },
  favoriteApps: [],
  accountStatusReason: 'Prueba automatizada de flujo externo',
  accountReviewedBy: { uid: 'test-script', email: 'admin@bacarsa.com.ar' },
})
const approvedSnap = await db.collection('users').doc(pendingAuth.uid).get()
const approved = approvedSnap.data() ?? {}
console.log('accountStatus:', approved.accountStatus)
console.log('view_directory:', approved.permissions?.view_directory)
console.log('view_drive:', approved.permissions?.view_drive)
console.log('view_links:', approved.permissions?.view_links)
if (approved.accountStatus !== 'active' || approved.permissions?.view_drive !== false) {
  throw new Error('Approved external must stay without view_drive')
}

console.log('\n=== 4) Drive API con externa aprobada → 403 ===')
process.env.TEST_EMAIL = PENDING_EMAIL
const externalToken = await getTestIdToken({ requireSuperAdmin: false })
const driveRes = await fetch(`${base}/api/drive/files?folderId=root`, {
  headers: { Authorization: `Bearer ${externalToken.idToken}` },
})
const driveText = await driveRes.text()
console.log('status:', driveRes.status)
console.log('body:', driveText)
if (driveRes.status !== 403) {
  throw new Error(`Expected 403, got ${driveRes.status}`)
}

console.log('\nOK: flujo external pending → approved → Drive bloqueado (403).')
