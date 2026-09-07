/**
 * Audita users en prod: role/permissions super_admin fuera de cuentas designadas.
 *
 *   node backend/scripts/audit-users-super-admin.mjs
 */

import { getFirestore } from 'firebase-admin/firestore'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const DESIGNATED_SUPER_ADMIN_EMAILS = new Set([
  'admin@bacarsa.com.ar',
  'sistemas.ti@bacarsa.com.ar',
])

loadTestEnv()
initAdmin()

const db = getFirestore()
const snap = await db.collection('users').get()

const flagged = []
for (const doc of snap.docs) {
  const d = doc.data()
  const email = (typeof d.email === 'string' ? d.email : '').trim().toLowerCase()
  const role = d.role
  const perms = d.permissions && typeof d.permissions === 'object' ? d.permissions : {}
  const isSuperRole = role === 'super_admin'
  const isSuperPerm = perms.super_admin === true
  if (!isSuperRole && !isSuperPerm) continue
  flagged.push({
    uid: doc.id,
    email,
    displayName: typeof d.displayName === 'string' ? d.displayName : '',
    role,
    permissions: perms,
    accountType: d.accountType ?? null,
    accountStatus: d.accountStatus ?? null,
    designated: DESIGNATED_SUPER_ADMIN_EMAILS.has(email),
  })
}

console.log('=== AUDITORIA users super_admin (prod) ===')
console.log('Total users:', snap.size)
console.log('Con super_admin (role o permission):', flagged.length)
console.log('')

for (const row of flagged.sort((a, b) => a.email.localeCompare(b.email))) {
  console.log(
    row.designated ? 'OK   ' : 'ALERT',
    row.email,
    '| role:',
    row.role,
    '| perm.super_admin:',
    row.permissions?.super_admin,
    '| uid:',
    row.uid,
  )
}

const suspicious = flagged.filter((r) => !r.designated)
if (suspicious.length) {
  console.log('')
  console.log('SOSPECHOSOS (no designados):', suspicious.length)
  console.log(JSON.stringify(suspicious, null, 2))
  process.exit(1)
}

console.log('')
console.log('Sin cuentas super_admin fuera de las designadas.')
