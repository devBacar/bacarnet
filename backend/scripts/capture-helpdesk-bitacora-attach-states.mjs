/**
 * Capturas: selector adjunto bitácora (vacío, hover, archivo elegido).
 * Usa mesa de ayuda (mismo componente que Mis proyectos).
 *
 *   node backend/scripts/capture-helpdesk-bitacora-attach-states.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { chromium } from 'playwright'
import { deleteHelpdeskTicketFull } from './helpdesk-e2e-cleanup.mjs'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output/bitacora-attach-ui')
const VITE_PORT = 5188
const API_PORT = 8798
const VITE = `http://127.0.0.1:${VITE_PORT}`
const API = `http://127.0.0.1:${API_PORT}`

const E2E_AREA = 'E2E Bitácora adjunto UI'
const MIN_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function waitOk(url) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`timeout ${url}`)
}

loadTestEnv()
initAdmin()

const auth = getAuth()
const db = getAdminDb()
const { uid: teamUid } = await getTestIdToken()

const teamSnap = await db.collection('helpdeskTeam').where('activo', '==', true).limit(1).get()
const assigneeId = teamSnap.docs[0].id
const ticketRef = db.collection('helpdeskTickets').doc()
await ticketRef.set({
  token: `ui-${ticketRef.id.slice(0, 6)}`,
  requesterUid: teamUid,
  requesterEmail: 'captura-ui@bacarsa.com.ar',
  requesterNombre: 'Captura UI',
  areaId: 'e2e-bitacora-ui',
  areaNombre: E2E_AREA,
  problematica: 'Captura selector adjunto',
  urgencia: 'media',
  estadoIdx: 4,
  asignadoATeamId: assigneeId,
  cancelado: false,
  createdAt: Timestamp.fromDate(new Date('2026-09-01T10:00:00Z')),
})

const envDevLocal = resolve(ROOT, '.env.development.local')
const wroteEnv = !existsSync(envDevLocal)
if (wroteEnv) writeFileSync(envDevLocal, `VITE_API_BASE_URL=${API}\n`, 'utf8')

const { app } = await import('../lib/server.js')
const server = await new Promise((resolvePromise, reject) => {
  const s = app.listen(API_PORT, '127.0.0.1', (err) => (err ? reject(err) : resolvePromise(s)))
})
const vite = spawn(
  'npx',
  ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
  {
    cwd: ROOT,
    env: { ...process.env, VITE_API_BASE_URL: API, VITE_E2E: 'true' },
    stdio: 'ignore',
    shell: true,
  },
)

try {
  mkdirSync(OUT, { recursive: true })
  await waitOk(`${API}/api/health`)
  await waitOk(VITE)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const customToken = await auth.createCustomToken(teamUid)
  await page.goto(VITE, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function', {
    timeout: 120_000,
  })
  await page.evaluate(async (t) => {
    await window.__e2eSignInWithCustomToken(t)
  }, customToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })

  await page.goto(`${VITE}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 60_000 })
  await page.getByTestId('helpdesk-mesa-ticket-row').filter({ hasText: E2E_AREA }).first().click()
  await page.getByTestId('helpdesk-mesa-detail').waitFor({ timeout: 30_000 })
  await page.getByTestId('helpdesk-mesa-bitacora-toggle').click()
  await page.getByTestId('helpdesk-bitacora-file-trigger').waitFor({ timeout: 30_000 })

  const attachBox = page.locator('[data-testid="helpdesk-bitacora-file-trigger"]')
  await attachBox.scrollIntoViewIfNeeded()
  await attachBox.screenshot({ path: resolve(OUT, '1-vacio.png') })

  await attachBox.hover()
  await page.waitForTimeout(250)
  await attachBox.screenshot({ path: resolve(OUT, '2-hover.png') })

  await page.getByTestId('helpdesk-bitacora-file').setInputFiles({
    name: 'informe-diagnostico-proyecto-sistemas-2026.png',
    mimeType: 'image/png',
    buffer: MIN_PNG,
  })
  await page.getByTestId('helpdesk-bitacora-file-selected').waitFor({ timeout: 10_000 })
  const selectedBox = page.locator('[data-testid="helpdesk-bitacora-file-selected"]')
  await selectedBox.screenshot({ path: resolve(OUT, '3-archivo-elegido.png') })

  await browser.close()
  console.log('Capturas en', OUT)
} finally {
  vite.kill('SIGTERM')
  server.close()
  await deleteHelpdeskTicketFull(ticketRef.id).catch(() => {})
  if (wroteEnv && existsSync(envDevLocal)) unlinkSync(envDevLocal)
}
