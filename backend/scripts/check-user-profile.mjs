/**
 * Diagnóstico rápido Auth + Firestore para un email.
 *   node backend/scripts/check-user-profile.mjs sistemas.ti@bacarsa.com.ar
 */

import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
initAdmin()

const email = (process.argv[2] ?? 'sistemas.ti@bacarsa.com.ar').trim().toLowerCase()
const auth = getAuth()
const db = getFirestore()

const record = await auth.getUserByEmail(email)
const snap = await db.collection('users').doc(record.uid).get()

console.log('===', email, '===')
console.log('Auth uid:', record.uid)
console.log('Auth emailVerified:', record.emailVerified)
console.log('Auth providers:', record.providerData.map((p) => p.providerId).join(', ') || '(ninguno)')
console.log('Firestore doc exists:', snap.exists)

if (snap.exists) {
  const d = snap.data()
  console.log('Firestore role:', d.role)
  console.log('permissions.super_admin:', d.permissions?.super_admin)
  console.log('accountType:', d.accountType)
  console.log('accountStatus:', d.accountStatus)
}

const byEmail = await db.collection('users').where('email', '==', email).get()
if (byEmail.size > 1) {
  console.log('ALERT: múltiples docs users con mismo email:', byEmail.docs.map((x) => x.id))
} else if (byEmail.size === 1 && byEmail.docs[0].id !== record.uid) {
  console.log('ALERT: uid Auth != uid Firestore por email')
  console.log('  Auth uid:', record.uid)
  console.log('  Firestore uid:', byEmail.docs[0].id)
}

if (!record.emailVerified) {
  console.log('')
  console.log('PROBABLE CAUSA: email_verified=false bloquea lectura del perfil (firestore.rules isVerifiedAuth).')
  console.log('Solución: marcar emailVerified=true en Auth o iniciar sesión con Google.')
}
