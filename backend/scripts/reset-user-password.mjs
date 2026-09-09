/**
 * Restablece contraseña de un usuario vía Admin SDK (emergencia / post-tests).
 *
 *   node backend/scripts/reset-user-password.mjs implementaciones.it@bacarsa.com.ar
 */

import { getAuth } from 'firebase-admin/auth'
import { generateEphemeralPassword } from './lib/testSecrets.mjs'
import { getAdminDb, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const email = (process.argv[2] ?? '').trim().toLowerCase()
const fixedPassword = (process.argv[3] ?? process.env.RESET_PASSWORD ?? '').trim()
if (!email) {
  console.error('Uso: node backend/scripts/reset-user-password.mjs <email> [contraseña-fija]')
  process.exit(1)
}

const tempPassword = fixedPassword || generateEphemeralPassword()

const q = await getAdminDb().collection('users').where('email', '==', email).limit(1).get()
if (q.empty) {
  console.error(`No hay users con email ${email}`)
  process.exit(1)
}

const uid = q.docs[0].id
const authUser = await getAuth().getUser(uid)
await getAuth().updateUser(uid, { password: tempPassword, emailVerified: true })

console.log(`Contraseña restablecida para ${authUser.email ?? email}`)
console.log(`uid: ${uid}`)
console.log(`Contraseña temporal: ${tempPassword}`)
console.log('Cambiala después del primer ingreso si podés.')
