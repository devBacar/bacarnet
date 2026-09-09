/**
 * Verifica que sistemas.ti puede leer su perfil vía REST (mismas rules que el cliente).
 */
import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
process.env.TEST_EMAIL = 'sistemas.ti@bacarsa.com.ar'

const { idToken, uid, email } = await getTestIdToken()
const projectId = process.env.VITE_FIREBASE_PROJECT_ID?.trim()
if (!projectId) throw new Error('Falta VITE_FIREBASE_PROJECT_ID')

const bootstrap = await fetch('https://bacarnet.web.app/api/users/bootstrap-profile', {
  method: 'POST',
  headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ source: 'google' }),
})
console.log('bootstrap-profile:', bootstrap.status, await bootstrap.text())

const fsRes = await fetch(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`,
  { headers: { Authorization: `Bearer ${idToken}` } },
)
console.log('firestore GET users/' + uid + ':', fsRes.status)
if (fsRes.ok) {
  const j = await fsRes.json()
  const f = j.fields ?? {}
  console.log('role:', f.role?.stringValue)
  console.log('super_admin:', f.permissions?.mapValue?.fields?.super_admin?.booleanValue)
} else {
  console.log(await fsRes.text())
}

console.log('email:', email, 'uid:', uid)
