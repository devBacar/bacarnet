/**
 * Comprobación POST-deploy (opcional): bundle publicado en bacarnet.web.app
 * y que /api/me responde same-origin. No reemplaza verify-hosting-bundle-local.mjs.
 *
 *   node backend/scripts/verify-prod-bundle-api.mjs
 */
import { getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
initAdmin()

const home = await fetch('https://bacarnet.web.app/')const html = await home.text()
const match = html.match(/assets\/(index-[^"]+\.js)/)
if (!match) throw new Error('No se encontró bundle JS en index.html')
const jsUrl = `https://bacarnet.web.app/assets/${match[1]}`
const js = await (await fetch(jsUrl)).text()

console.log('bundle:', jsUrl)
const badLocal =
  /127\.0\.0\.1/.test(js) || /localhost:\d{2,5}/i.test(js)
console.log('contains 127.0.0.1:', /127\.0\.0\.1/.test(js))
console.log('contains localhost:puerto:', /localhost:\d{2,5}/i.test(js))
if (badLocal) {
  console.error('FAIL  El bundle en producción incluye URLs locales de API')
  process.exit(1)
}

const { idToken } = await getTestIdToken()
const statusRes = await fetch('https://bacarnet.web.app/api/me/google/status', {
  headers: { Authorization: `Bearer ${idToken}` },
})
console.log('GET /api/me/google/status →', statusRes.status, statusRes.url)
