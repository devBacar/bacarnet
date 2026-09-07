import { getTestIdToken } from './get-test-token.mjs'

const base = 'https://bacarnet.web.app'
process.env.TEST_EMAIL = 'implementaciones.it@bacarsa.com.ar'
const debora = await getTestIdToken({ requireSuperAdmin: false })

const admin = await fetch(`${base}/admin`, {
  redirect: 'manual',
  headers: { Authorization: `Bearer ${debora.idToken}` },
})
console.log('GET /admin (SPA - may 200 html)', admin.status)

const boards = await fetch(`${base}/api/boards`, {
  headers: { Authorization: `Bearer ${debora.idToken}` },
})
console.log('boards API', boards.status, (await boards.text()).slice(0, 120))
