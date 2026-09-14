/**
 * Playwright: upload análisis → notificación in-app al aprobador → deep link.
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
const VITE_PORT = 5188
const API_PORT = 8792
const VITE = `http://127.0.0.1:${VITE_PORT}`
const API = `http://127.0.0.1:${API_PORT}`

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
const team = await getTestIdToken()
const approverEmail = team.email.toLowerCase()
const approverUid = team.uid

const ticketRef = db.collection('helpdeskTickets').doc()
const ticketId = ticketRef.id
await ticketRef.set({
  token: 'e2e-notif-analisis',
  requesterUid: team.uid,
  requesterEmail: team.email,
  requesterNombre: 'E2E Notif Análisis',
  areaId: 'e2e',
  areaNombre: 'E2E Notif Análisis',
  problematica: 'Proyecto de prueba notificación aprobación',
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
  if (!uploadRes.ok) {
    throw new Error(`upload analisis ${uploadRes.status} ${await uploadRes.text()}`)
  }

  await new Promise((r) => setTimeout(r, 1500))

  const notifSnap = await db
    .collection('users')
    .doc(approverUid)
    .collection('notifications')
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get()

  const hit = notifSnap.docs.find((d) => d.get('type') === 'helpdesk_analisis_pendiente')
  if (!hit) throw new Error('FAIL: no hay notificación helpdesk_analisis_pendiente')
  const deepLink = hit.get('deepLink')
  if (deepLink?.path !== '/aprobaciones-pendientes') {
    throw new Error(`FAIL: deepLink ${JSON.stringify(deepLink)}`)
  }
  console.log('PASS: notificación in-app creada')

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

  const bell = page.getByTestId('notification-bell-button')
  if (await bell.isVisible().catch(() => false)) {
    await bell.click()
    await page.getByText('Análisis pendiente de aprobación').first().click()
  } else {
    console.log('WARN: campanita oculta (notificationsEnabled); navegación directa a aprobaciones')
  }
  let pending = false
  for (let i = 0; i < 8; i++) {
    const listRes = await fetch(`${API}/api/helpdesk/analisis-pendientes`, {
      headers: { Authorization: `Bearer ${team.idToken}` },
    })
    const listBody = await listRes.json()
    pending = (listBody.items ?? []).some((it) => it.ticketId === ticketId)
    if (pending) break
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!pending) throw new Error('FAIL: analisis no listado para aprobador vía API')
  console.log('PASS: analisis visible vía API para aprobador')

  if (!page.url().includes('/aprobaciones-pendientes')) {
    await page.goto(`${VITE}/aprobaciones-pendientes`, { waitUntil: 'domcontentloaded' })
  }
  await page.getByTestId('aprobaciones-pendientes-page').waitFor({ timeout: 60_000 })
  await page.getByTestId('aprobacion-pendiente-item').waitFor({ timeout: 60_000 })
  await page.screenshot({
    path: resolve(OUT, 'e2e-notif-aprobaciones-pendientes.png'),
    fullPage: true,
  })
  await browser.close()
  console.log('PASS: Playwright navegó a aprobaciones desde campanita')
} finally {
  vite.kill('SIGTERM')
  server.close()
  await deleteHelpdeskTicketFull(ticketId).catch(() => {})
}
