import { getAdminDb, loadTestEnv } from './get-test-token.mjs'

const uid = process.argv[2]
if (!uid) {
  console.error('Uso: node backend/scripts/read-emulator-user.mjs <uid>')
  process.exit(1)
}

loadTestEnv()
const snap = await getAdminDb().collection('users').doc(uid).get()
console.log(JSON.stringify(snap.exists ? snap.data() : null, null, 2))
