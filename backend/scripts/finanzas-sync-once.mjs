/**
 * POST /api/finanzas/cuentas/sync (staging o emulador).
 *
 * Uso local emulador:
 *   node backend/scripts/finanzas-sync-once.mjs
 * Staging ngrok:
 *   set FUNCTIONS_API_BASE=https://elusive-verse-turbulent.ngrok-free.dev/api
 *   set TEST_EMAIL=sistemas.ti@bacarsa.com.ar
 *   node backend/scripts/finanzas-sync-once.mjs
 */
import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const API =
  process.env.FUNCTIONS_API_BASE?.trim() ||
  'http://127.0.0.1:5000/api'

const { idToken, uid, email } = await getTestIdToken()
process.stderr.write(`Sync finanzas uid=${uid} email=${email}\n`)

const res = await fetch(`${API}/finanzas/cuentas/sync`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${idToken}`,
    'ngrok-skip-browser-warning': '1',
  },
})
const text = await res.text()
console.log(`HTTP ${res.status}`)
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2))
} catch {
  console.log(text)
}
if (!res.ok) process.exit(1)
