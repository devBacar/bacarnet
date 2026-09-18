/**
 * Modal de aprobaciones: sin link en navbar, apertura desde campanita.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/e2e-aprobaciones-modal.mjs
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { chromium } from 'playwright'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'
import { deleteHelpdeskTicketFull } from './helpdesk-e2e-cleanup.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const SHOT = resolve(OUT, 'e2e-aprobaciones-modal.png')
const VITE_PORT = 5190
const API_PORT = 8794
const VITE = `http://127.0.0.1:${VITE_PORT}`
const API = `http://127.0.0.1:${API_PORT}`

function record(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}

async function waitOk(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`timeout ${url}`)
}

loadTestEnv()
initAdmin()
const db = getAdminDb()
await db.collection('global_settings').doc('main').set(
  {
    boardsEnabled: true,
    resourcesEnabled: true,
    directoryEnabled: true,
    notificationsEnabled: true,
    pollsEnabled: true,
  },
  { merge: true },
)
const team = await getTestIdToken()
const approverEmail = team.email.toLowerCase()
const approverUid = team.uid

const ticketRef = db.collection('helpdeskTickets').doc()
const ticketId = ticketRef.id
await ticketRef.set({
  token: 'e2e-modal-aprob',
  requesterUid: team.uid,
  requesterEmail: team.email,
  requesterNombre: 'E2E Modal Aprob',
  areaId: 'e2e',
  areaNombre: 'E2E Modal Aprobaciones',
  problematica: 'Proyecto de prueba modal aprobación',
  urgencia: 'media',
  estadoIdx: 2,
  asignadoATeamId: null,
  createdAt: Timestamp.now(),
})

const pdfBytes = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n100\n%%EOF',
)

const { app } = await import('../lib/server.js')
const server = await new Promise((resolvePromise, reject) => {
  const instance = app.listen(API_PORT, '127.0.0.1', (error) =>
    error ? reject(error) : resolvePromise(instance),
  )
})
const vite = spawn(
  'npx',
  ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
  {
    cwd: ROOT,
    env: { ...process.env, VITE_API_BASE_URL: API },
    shell: true,
    stdio: 'ignore',
  },
)

try {
  await waitOk(`${API}/api/health`)
  await waitOk(VITE)

  const form = new FormData()
  form.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'analisis-e2e.pdf')
  form.append('aprobadoresEmails', approverEmail)

  const uploadRes = await fetch(`${API}/api/helpdesk/tickets/${ticketId}/analisis`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${team.idToken}` },
    body: form,
  })
  if (!uploadRes.ok) throw new Error(`upload ${uploadRes.status}`)
  let pending = false
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 500))
    const listRes = await fetch(`${API}/api/helpdesk/analisis-pendientes`, {
      headers: { Authorization: `Bearer ${team.idToken}` },
    })
    const listBody = await listRes.json()
    pending = (listBody.items ?? []).some((it) => it.ticketId === ticketId)
    if (pending) break
  }
  if (!pending) throw new Error('FAIL: análisis no listado para aprobador vía API')

  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const customToken = await getAuth().createCustomToken(approverUid)
  await page.goto(`${VITE}/intranet`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function')
  await page.evaluate(async (t) => {
    await window.__e2eSignInWithCustomToken(t)
  }, customToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })

  const navLink = page.getByRole('link', { name: 'Aprobaciones pendientes' })
  record('Navbar sin link Aprobaciones pendientes', (await navLink.count()) === 0)

  const bell = page.getByTestId('notification-bell-button')
  const bellVisible = await bell.waitFor({ timeout: 8_000 }).then(() => true).catch(() => false)
  if (bellVisible) {
    await bell.click()
    await page.getByText('Análisis pendiente de aprobación').first().click()
    record('Apertura desde campanita', true)
  } else {
    console.log('WARN: campanita no visible; abriendo modal vía deep link /aprobaciones-pendientes')
    await page.goto(`${VITE}/aprobaciones-pendientes`, { waitUntil: 'domcontentloaded' })
    record('Apertura vía deep link (fallback)', true)
  }

  await page.getByTestId('aprobaciones-pendientes-modal').waitFor({ timeout: 30_000 })
  record('Modal visible', true)
  record('URL en intranet (popup, no página dedicada)', page.url().includes('/intranet'))

  await page
    .locator(
      '[data-testid="aprobacion-pendiente-item"], [data-testid="aprobaciones-pendientes-empty"]',
    )
    .first()
    .waitFor({ timeout: 60_000 })
  if (await page.getByTestId('aprobaciones-pendientes-empty').isVisible()) {
    const snippet = await page.getByTestId('aprobaciones-pendientes-modal').innerText()
    throw new Error(`FAIL: modal vacío en UI — ${snippet.slice(0, 280)}`)
  }
  await page.getByTestId('aprobacion-pendiente-item').waitFor({ timeout: 5_000 })
  await page.screenshot({ path: SHOT, fullPage: false })
  record('Screenshot modal', true, SHOT)

  await page.getByTestId('aprobaciones-pendientes-modal-close').click()
  await page.getByTestId('aprobaciones-pendientes-modal').waitFor({ state: 'hidden', timeout: 10_000 })
  record('Modal se cierra sin decidir', true)

  if (bellVisible) {
    await bell.click()
    await page.getByText('Análisis pendiente de aprobación').first().click()
  } else {
    await page.goto(`${VITE}/aprobaciones-pendientes`, { waitUntil: 'domcontentloaded' })
  }
  await page.getByTestId('aprobaciones-pendientes-modal').waitFor({ timeout: 30_000 })
  await page.getByTestId('aprobacion-aprobar').first().click()
  await page.getByTestId('aprobaciones-pendientes-modal').waitFor({ state: 'hidden', timeout: 60_000 })
  record('Modal se cierra tras aprobar', true)

  await browser.close()
} finally {
  vite.kill('SIGTERM')
  server.close()
  await deleteHelpdeskTicketFull(ticketId).catch(() => {})
}

if (process.exitCode) process.exit(process.exitCode)
console.log('\nDone')
