import { getTestIdToken } from './get-test-token.mjs'

const base = process.env.FUNCTIONS_API_BASE?.trim() || 'https://bacarnet.web.app'
process.env.TEST_EMAIL = process.env.TEST_EMAIL || 'implementaciones.it@bacarsa.com.ar'
const user = await getTestIdToken({ requireSuperAdmin: false })
console.log('as', user.email, user.role)

for (const path of ['/api/drive/files?folderId=root', '/api/boards', '/api/boards/visibility']) {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${user.idToken}` },
  })
  const text = await res.text()
  console.log('\n', path, res.status)
  console.log(text.slice(0, 400))
}

process.env.TEST_EMAIL = 'admin@bacarsa.com.ar'
const admin = await getTestIdToken()
const adminRes = await fetch(`${base}/api/drive/files?folderId=root`, {
  headers: { Authorization: `Bearer ${admin.idToken}` },
})
console.log('\n admin drive', adminRes.status, (await adminRes.text()).slice(0, 120))
