import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
const API = 'https://bacarnet.web.app'
const approveFileId = '1ajOGvgJdZeKiuyQZXQvYnz7qajWSnq4A6e763p16thQ'
const requestId = 'eb2uYfiu3IO7rjXvIiBF'

process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
const admin = await getTestIdToken()
const res = await fetch(`${API}/api/approval-requests/${requestId}/approve`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${admin.idToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ reason: 'Aprobado en chequeo visual Fase 2' }),
})
console.log('approve', res.status, await res.text())

process.env.TEST_EMAIL = 'implementaciones.ti@bacarsa.com.ar'
const ti = await getTestIdToken({ requireSuperAdmin: false })
const file = await fetch(`${API}/api/drive/files/${approveFileId}`, {
  headers: { Authorization: `Bearer ${ti.idToken}` },
})
console.log('file', file.status, await file.text())
