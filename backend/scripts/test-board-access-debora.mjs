import { getTestIdToken } from './get-test-token.mjs'

const base = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'
const boardId = '140_xtWc8wk4hl7Tfy9aU-VRm41AGjzv9'

process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
const admin = await getTestIdToken()

const list = await fetch(`${base}/api/boards/${boardId}/access`, {
  headers: { Authorization: `Bearer ${admin.idToken}` },
})
console.log('access list', list.status, await list.text())

process.env.TEST_EMAIL = 'implementaciones.it@bacarsa.com.ar'
const debora = await getTestIdToken({ requireSuperAdmin: false })

const visibility = await fetch(`${base}/api/boards/visibility`, {
  headers: { Authorization: `Bearer ${debora.idToken}` },
})
console.log('visibility', visibility.status, await visibility.text())

const boards = await fetch(`${base}/api/boards`, {
  headers: { Authorization: `Bearer ${debora.idToken}` },
})
console.log('boards', boards.status, await boards.text())

const shortReason = await fetch(`${base}/api/boards/${boardId}/access`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${admin.idToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email: 'implementaciones.it@bacarsa.com.ar', reason: 'ok' }),
})
console.log('short reason grant', shortReason.status, await shortReason.text())

const tinyReason = await fetch(`${base}/api/boards/${boardId}/access`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${admin.idToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email: 'implementaciones.it@bacarsa.com.ar', reason: 'ab' }),
})
console.log('too short reason', tinyReason.status, await tinyReason.text())
