/**
 * Playwright: pestaña Auditoría de campaña en /sistemas/mesa-ayuda.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/e2e-helpdesk-campana-auditoria.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output/campana-auditoria-panel.png')
const VITE_PORT = 5175
const API_PORT = 8795
const VITE = `http://127.0.0.1:${VITE_PORT}`
const API = `http://127.0.0.1:${API_PORT}`

async function waitOk(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`timeout ${url}`)
}

loadTestEnv()
initAdmin()

const ENV_DEV_LOCAL = resolve(ROOT, '.env.development.local')
const wroteEnv = !existsSync(ENV_DEV_LOCAL)
if (wroteEnv) writeFileSync(ENV_DEV_LOCAL, `VITE_API_BASE_URL=${API}\n`, 'utf8')

const { app } = await import('../lib/server.js')
const server = await new Promise((res, rej) => {
  const s = app.listen(API_PORT, '127.0.0.1', (e) => (e ? rej(e) : res(s)))
})
await waitOk(`${API}/api/health`)

const vite = spawn(
  'npx',
  ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
  {
    cwd: ROOT,
    env: { ...process.env, VITE_API_BASE_URL: API },
    stdio: 'ignore',
    shell: true,
  },
)
await waitOk(VITE)

const db = getAdminDb()
const teamSnap = await db.collection('helpdeskTeam').where('activo', '==', true).limit(8).get()
const teamEmails = teamSnap.docs
  .map((d) => (typeof d.get('email') === 'string' ? d.get('email').trim().toLowerCase() : ''))
  .filter(Boolean)

let teamUid = null
for (const email of teamEmails) {
  try {
    teamUid = (await getAuth().getUserByEmail(email)).uid
    break
  } catch {
    /* next */
  }
}
if (!teamUid) teamUid = (await getTestIdToken()).uid

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

try {
  const customToken = await getAuth().createCustomToken(teamUid)
  await page.goto(`${VITE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function')
  await page.evaluate(async (t) => window.__e2eSignInWithCustomToken(t), customToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })
  await page.goto(`${VITE}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 60_000 })
  await page.getByTestId('helpdesk-campana-auditoria-tab').click()
  await page.getByTestId('helpdesk-campana-auditoria').waitFor({ timeout: 30_000 })
  await page.getByText('Cargando auditoría…').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})
  const errorVisible = await page.getByTestId('helpdesk-campana-auditoria-error').isVisible().catch(() => false)
  if (errorVisible) {
    throw new Error(await page.getByTestId('helpdesk-campana-auditoria-error').innerText())
  }
  await page.getByTestId('helpdesk-campana-auditoria-row').first().waitFor({ timeout: 30_000 })
  const rowCount = await page.getByTestId('helpdesk-campana-auditoria-row').count()
  if (rowCount < 1) throw new Error('la tabla de auditoría no tiene filas')
  mkdirSync(dirname(OUT), { recursive: true })
  await page.screenshot({ path: OUT, fullPage: true })
  console.log(JSON.stringify({ rows: rowCount, screenshot: OUT }))
  console.log('PASS: auditoría de campaña visible')
} finally {
  await browser.close()
  vite.kill('SIGTERM')
  await new Promise((r) => server.close(r))
  if (wroteEnv && existsSync(ENV_DEV_LOCAL)) unlinkSync(ENV_DEV_LOCAL)
}
