/**
 * Compara latencia / errores: hosting rewrite vs Cloud Function directa + UI.
 */
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { grantBoardAccess, revokeBoardAccess } from '../lib/modules/boards/boardAccess.js'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

const PROD_APP = 'https://bacarnet.web.app'
const PROD_CF =
  process.env.FUNCTIONS_API_BASE?.replace(/\/+$/, '') ||
  'https://southamerica-east1-bacar-web.cloudfunctions.net/api'

loadTestEnv()
initAdmin()

const boardFolderId = process.env.HELPDESK_BOARD_PROYECTOS_FOLDER_ID?.trim()
if (!boardFolderId) throw new Error('Falta HELPDESK_BOARD_PROYECTOS_FOLDER_ID')

const actor = await getTestIdToken()
const testEmail = `probe.tablero+${Date.now()}@bacarsa.com.ar`
const testPassword = `Probe${Date.now()}a!`
const auth = getAuth()
const db = getAdminDb()

const testUser = await auth.createUser({
  email: testEmail,
  password: testPassword,
  emailVerified: true,
})
await db.collection('users').doc(testUser.uid).set({
  email: testEmail,
  displayName: 'Probe Tablero',
  department: 'General',
  role: 'user',
  accountType: 'corporate',
  accountStatus: 'active',
  permissions: {
    view_directory: true,
    view_drive: true,
    view_links: true,
    manage_news: false,
    manage_links: false,
    manage_users: false,
    super_admin: false,
    rag_assistant: false,
  },
})

await grantBoardAccess({
  boardFolderId,
  boardName: 'Desarrollo · Proyectos',
  grantee: { uid: testUser.uid, email: testEmail, displayName: 'Probe Tablero' },
  actor,
})

async function signInPassword(email, password) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY?.trim()
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  )
  const body = await res.json()
  if (!res.ok) throw new Error(body.error?.message ?? 'signIn failed')
  return body.idToken
}

const token = await signInPassword(testEmail, testPassword)

async function timedFetch(label, url) {
  const t0 = Date.now()
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(120_000),
    })
    const text = await res.text()
    console.log(label, {
      status: res.status,
      ms: Date.now() - t0,
      bodyStart: text.slice(0, 120),
    })
  } catch (e) {
    console.log(label, { err: String(e), ms: Date.now() - t0 })
  }
}

await timedFetch('node-hosting', `${PROD_APP}/api/helpdesk/tablero-proyectos`)
await timedFetch('node-cf', `${PROD_CF}/api/helpdesk/tablero-proyectos`)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('browser-console-error:', msg.text())
})
page.on('requestfailed', (req) => {
  if (req.url().includes('tablero-proyectos')) {
    console.log('browser-request-failed:', req.url(), req.failure()?.errorText)
  }
})

await page.goto(`${PROD_APP}/`, { waitUntil: 'domcontentloaded' })
await page.locator('#login-email').fill(testEmail)
await page.locator('#login-password').fill(testPassword)
await page
  .locator('form')
  .filter({ has: page.locator('#login-email') })
  .getByRole('button', { name: /^iniciar sesión$/i })
  .click()
await page.getByText(/Sesión activa|¡Hola,/i).first().waitFor({ timeout: 90_000 })

const responsePromise = page.waitForResponse(
  (r) => r.url().includes('tablero-proyectos'),
  { timeout: 120_000 },
)
await page.goto(`${PROD_APP}/tableros/desarrollo-proyectos`, { waitUntil: 'domcontentloaded' })
const apiResponse = await responsePromise
console.log('browser-api-response:', apiResponse.status(), apiResponse.url())

try {
  await page.getByText('En curso').first().waitFor({ timeout: 120_000 })
  console.log('UI: datos cargados (En curso visible)')
} catch {
  const errText = await page
    .getByTestId('tablero-proyectos-access-denied')
    .textContent()
    .catch(() => null)
  console.log('UI: sin KPIs. Error panel:', errText)
}

await browser.close()

await revokeBoardAccess({
  boardFolderId,
  granteeUid: testUser.uid,
  actor,
})
await auth.deleteUser(testUser.uid)
await db.collection('users').doc(testUser.uid).delete()
