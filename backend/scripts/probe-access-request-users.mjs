import { getAdminDb, getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const FILE_ID = process.argv[2] || '1spB-ew5jGpA6ZYwhrIhWfPr9MSa7DbxKR2jAqGa5npE'
const API = 'https://intranet-bacar.web.app'

async function probe(email) {
  process.env.TEST_EMAIL = email
  try {
    const user = await getTestIdToken({ requireSuperAdmin: false })
    const res = await fetch(`${API}/api/approval-requests/access`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileId: FILE_ID, reason: 'Probe solicitud acceso visual' }),
    })
    return { email, status: res.status, role: user.role }
  } catch (err) {
    return { email, error: err instanceof Error ? err.message : String(err) }
  }
}

const db = getAdminDb()
const snap = await db.collection('users').limit(50).get()
for (const doc of snap.docs) {
  const email = doc.get('email')
  const role = doc.get('role')
  if (typeof email !== 'string' || role === 'super_admin') continue
  const row = await probe(email.trim().toLowerCase())
  console.log(JSON.stringify(row))
}
