import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
const API = 'https://bacarnet.web.app'

process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
const admin = await getTestIdToken()

const approveId = 'Vus8NshmfXoTuyWjU057'
const res = await fetch(`${API}/api/approval-requests/${approveId}/approve`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${admin.idToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ reason: 'Aprobado en chequeo visual Fase 2' }),
})
console.log('approve', res.status, await res.text())
