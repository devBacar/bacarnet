/**
 * Verifica grilla 9:00–15:00 en /support y panel interno (reunión siguiente).
 *
 *   npm --prefix backend run build
 *   node backend/scripts/e2e-helpdesk-business-hours.mjs
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { chromium } from 'playwright'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'
import { deleteHelpdeskTicketFull } from './helpdesk-e2e-cleanup.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const SCREEN_SUPPORT = resolve(OUT, 'helpdesk-horarios-support.png')
const SCREEN_PANEL = resolve(OUT, 'helpdesk-horarios-panel.png')

/** Puerto E2E (whitelist en server.ts); evita colisión con `npm run dev` en 5174. */
const VITE_PORT = Number(process.env.E2E_VITE_PORT ?? 5189)
const API_PORT = Number(process.env.HELPDESK_TEST_PORT ?? 8799)
const VITE = `http://127.0.0.1:${VITE_PORT}`
const API = `http://127.0.0.1:${API_PORT}`

const results = []
let ticketId = null

function record(label, ok, detail = '') {
  results.push({ label, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
}

async function waitOk(url, timeoutMs = 120_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Timeout ${url}`)
}

function assertHourRows(hourLabels, context) {
  const set = new Set(hourLabels.map((h) => h.trim()).filter(Boolean))
  record(`${context}: incluye 09:00`, set.has('09:00'))
  record(`${context}: incluye 15:00`, set.has('15:00'))
  record(`${context}: sin 16:00`, !set.has('16:00'))
  record(`${context}: sin 17:00`, !set.has('17:00'))
  const expectedCount = 7
  record(`${context}: ${expectedCount} filas horarias`, set.size === expectedCount, `got ${set.size}`)
}

async function readGridHourLabels(page) {
  return page.locator('table tbody tr td:first-child').allTextContents()
}

async function signInTeam(page, uid) {
  await page.goto(`${VITE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function', {
    timeout: 120_000,
  })
  const customToken = await getAuth().createCustomToken(uid)
  await page.evaluate(async (t) => {
    await window.__e2eSignInWithCustomToken(t)
  }, customToken)
  await page.getByText(/sesión activa/i).waitFor({ timeout: 90_000 })
}

async function main() {
  loadTestEnv()
  if (!process.env.HELPDESK_TOKEN_SECRET?.trim()) {
    throw new Error('HELPDESK_TOKEN_SECRET requerido')
  }

  initAdmin()
  const db = getAdminDb()

  const teamSnap = await db.collection('helpdeskTeam').where('activo', '==', true).limit(1).get()
  if (teamSnap.empty) throw new Error('helpdeskTeam vacío')
  const assigneeId = teamSnap.docs[0].id

  const { generarTokenSolicitud } = await import('../lib/modules/helpdesk/accessToken.js')
  const token = generarTokenSolicitud({
    uid: null,
    email: `e2e.hours+${Date.now()}@bacarsa.com.ar`,
    nombre: 'E2E Horarios',
    areaId: 'e2e-hours',
    areaNombre: 'E2E Horarios',
  })

  ticketId = db.collection('helpdeskTickets').doc().id
  await db
    .collection('helpdeskTickets')
    .doc(ticketId)
    .set({
      token: 'e2e-hours',
      requesterUid: null,
      requesterEmail: 'e2e.hours@bacarsa.com.ar',
      requesterNombre: 'E2E Horarios',
      areaId: 'e2e-hours',
      areaNombre: 'E2E Horarios',
      problematica: 'Test horarios',
      urgencia: 'media',
      estadoIdx: 3,
      asignadoATeamId: assigneeId,
      createdAt: Timestamp.now(),
    })

  const { app } = await import('../lib/server.js')
  const server = await new Promise((resolvePromise, reject) => {
    const s = app.listen(API_PORT, '127.0.0.1', (err) => (err ? reject(err) : resolvePromise(s)))
  })
  const viteBin = resolve(ROOT, 'node_modules/vite/bin/vite.js')
  const viteEnv = {
    ...process.env,
    VITE_API_BASE_URL: API,
    HELPDESK_TEST_PORT: String(API_PORT),
    VITE_E2E: 'true',
  }
  execFileSync(process.execPath, [viteBin, 'build'], { cwd: ROOT, env: viteEnv, stdio: 'inherit' })
  const vite = spawn(
    process.execPath,
    [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
    { cwd: ROOT, env: viteEnv, stdio: 'ignore' },
  )

  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: true })

  try {
    await waitOk(`${API}/api/health`)
    await waitOk(VITE)

    const disp = await fetch(
      `${API}/api/helpdesk/disponibilidad-inicial?token=${encodeURIComponent(token)}&semanaOffset=0`,
    )
    const dispBody = await disp.json()
    const apiHoras = new Set((dispBody.slots ?? []).map((s) => s.hora))
    record('API disponibilidad-inicial sin 16:00', !apiHoras.has('16:00'))
    record('API disponibilidad-inicial sin 17:00', !apiHoras.has('17:00'))
    record('API disponibilidad-inicial incluye 15:00', apiHoras.has('15:00'))

    const teamMemberDisp = await fetch(
      `${API}/api/helpdesk/disponibilidad/${encodeURIComponent(assigneeId)}?semanaOffset=0`,
      { headers: { Authorization: `Bearer ${(await getTestIdToken()).idToken}` } },
    )
    const teamBody = await teamMemberDisp.json()
    const teamHoras = new Set((teamBody.slots ?? []).map((s) => s.hora))
    record('API disponibilidad miembro sin 16:00', !teamHoras.has('16:00'))
    record('API disponibilidad miembro incluye 15:00', teamHoras.has('15:00'))

    const pageSupport = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await pageSupport.goto(`${VITE}/support?t=${encodeURIComponent(token)}`, {
      waitUntil: 'networkidle',
    })
    await pageSupport.getByRole('heading', { name: 'Solicitar primera reunión' }).waitFor({
      timeout: 120_000,
    })
    await pageSupport.getByText(/9 a 15 hs/i).waitFor({ timeout: 30_000 })
    await pageSupport.locator('table tbody tr').first().waitFor({ timeout: 60_000 })
    const supportHours = await readGridHourLabels(pageSupport)
    assertHourRows(supportHours, 'UI /support')
    await pageSupport.screenshot({ path: SCREEN_SUPPORT, fullPage: true })
    record('Screenshot grilla /support', existsSync(SCREEN_SUPPORT))

    const team = await getTestIdToken()
    const pagePanel = await browser.newPage({ viewport: { width: 1400, height: 960 } })
    await signInTeam(pagePanel, team.uid)
    await pagePanel.goto(`${VITE}/sistemas/mesa-ayuda?ticket=${ticketId}`, {
      waitUntil: 'domcontentloaded',
    })
    await pagePanel.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 90_000 })
    await pagePanel
      .getByTestId('helpdesk-mesa-ticket-row')
      .filter({ hasText: 'E2E Horarios' })
      .first()
      .click()
    await pagePanel.getByTestId('helpdesk-mesa-detail').waitFor({ timeout: 60_000 })
    await pagePanel.getByTestId('helpdesk-mesa-reuniones-toggle').click()
    await pagePanel.getByRole('button', { name: 'Agendar nueva reunión' }).click()
    await pagePanel.getByText(/9 a 15 hs/i).waitFor({ timeout: 30_000 })
    await pagePanel.locator('table tbody tr').first().waitFor({ timeout: 30_000 })
    const panelHours = await readGridHourLabels(pagePanel)
    assertHourRows(panelHours, 'UI panel interno')
    await pagePanel.screenshot({ path: SCREEN_PANEL, fullPage: true })
    record('Screenshot grilla panel', existsSync(SCREEN_PANEL))

    await browser.close()
  } finally {
    vite.kill('SIGTERM')
    server.close()
    if (ticketId) await deleteHelpdeskTicketFull(ticketId).catch(() => {})
  }

  const failed = results.filter((r) => !r.ok)
  if (failed.length) {
    console.error('\nFallos:', failed)
    process.exit(1)
  }
  console.log(`\nCapturas: ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
