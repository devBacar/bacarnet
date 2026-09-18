/**
 * E2E: cancelación en Zona de riesgo (panel mesa de ayuda).
 *
 *   node backend/scripts/e2e-helpdesk-zona-riesgo-layout.mjs
 */

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getTestIdToken, initAdmin, getAdminDb, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(SCRIPT_DIR, 'output')
const SCREENSHOT = resolve(OUTPUT_DIR, 'helpdesk-zona-riesgo-acciones.png')

const VITE_PORT = Number(process.env.E2E_VITE_PORT ?? 5176)
const API_PORT = Number(process.env.HELPDESK_TEST_PORT ?? 8796)
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`
const E2E_AREA = 'E2E Zona Riesgo Layout'

const results = []
let ticketId = null

function record(label, ok, detail = '') {
  results.push({ label, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
}

async function waitForHttpOk(url, timeoutMs = 120_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (res.ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 600))
  }
  throw new Error(`Timeout esperando ${url}`)
}

async function ensureBackendListening() {
  const { app } = await import('../lib/server.js')
  const server = await new Promise((resolvePromise, reject) => {
    const s = app.listen(API_PORT, '127.0.0.1', (err) => (err ? reject(err) : resolvePromise(s)))
  })
  await waitForHttpOk(`${API_ORIGIN}/api/health`, 30_000)
  return server
}

async function ensureViteDev() {
  const child = spawn(
    'npx',
    ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
    {
      cwd: ROOT,
      env: { ...process.env, VITE_API_BASE_URL: API_ORIGIN },
      stdio: 'ignore',
      shell: true,
    },
  )
  await waitForHttpOk(VITE_ORIGIN, 120_000)
  return child
}

async function seedTicket(assigneeId) {
  initAdmin()
  const db = getAdminDb()
  const { uid, email } = await getTestIdToken()
  const ref = db.collection('helpdeskTickets').doc()
  ticketId = ref.id
  await ref.set({
    token: 'e2e-zona-riesgo',
    requesterUid: uid,
    requesterEmail: email,
    requesterNombre: 'E2E Zona',
    areaId: 'e2e-area',
    areaNombre: E2E_AREA,
    problematica: 'Ticket prueba zona de riesgo',
    urgencia: 'media',
    estadoIdx: 1,
    asignadoATeamId: assigneeId,
    createdAt: FieldValue.serverTimestamp(),
  })
}

async function cleanup() {
  if (!ticketId) return
  initAdmin()
  const db = getAdminDb()
  for (const sub of ['reuniones', 'notas']) {
    const snap = await db.collection('helpdeskTickets').doc(ticketId).collection(sub).get()
    for (const doc of snap.docs) await doc.ref.delete()
  }
  await db.collection('helpdeskTickets').doc(ticketId).delete().catch(() => {})
}

async function signInWithCustomToken(page, uid) {
  const customToken = await getAuth().createCustomToken(uid)
  await page.goto(`${VITE_ORIGIN}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function', {
    timeout: 30_000,
  })
  await page.evaluate(async (token) => {
    await window.__e2eSignInWithCustomToken(token)
  }, customToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })
}

async function main() {
  loadTestEnv()
  initAdmin()
  const db = getAdminDb()
  const teamSnap = await db.collection('helpdeskTeam').where('activo', '==', true).get()
  if (teamSnap.empty) throw new Error('helpdeskTeam vacío')
  const teamDoc = teamSnap.docs[0]
  const assigneeId = teamDoc.id
  const teamEmail =
    typeof teamDoc.get('email') === 'string' ? teamDoc.get('email').trim().toLowerCase() : ''
  if (!teamEmail) throw new Error('helpdeskTeam sin email')
  const userSnap = await db.collection('users').where('email', '==', teamEmail).limit(1).get()
  if (userSnap.empty) throw new Error(`No hay users con email ${teamEmail}`)
  const teamMemberUid = userSnap.docs[0].id

  mkdirSync(OUTPUT_DIR, { recursive: true })
  let backendServer = null
  let viteProcess = null
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    backendServer = await ensureBackendListening()
    viteProcess = await ensureViteDev()
    await seedTicket(assigneeId)

    await signInWithCustomToken(page, teamMemberUid)
    await page.goto(`${VITE_ORIGIN}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 60_000 })
    await page.getByTestId('helpdesk-mesa-ticket-row').filter({ hasText: E2E_AREA }).first().click()
    await page.getByTestId('helpdesk-mesa-detail').waitFor({ timeout: 30_000 })

    const seguimiento = page.getByTestId('helpdesk-mesa-seguimiento')
    const seguimientoHasCancelBlock = await seguimiento
      .getByTestId('helpdesk-cancelacion-section')
      .isVisible()
      .catch(() => false)
    record('Seguimiento sin bloque de cancelación', !seguimientoHasCancelBlock)

    const seguimientoText = await seguimiento.innerText()
    record(
      'Seguimiento sin botón Cancelar proyecto',
      !seguimientoText.includes('Cancelar proyecto'),
    )

    await page.getByTestId('helpdesk-mesa-zona-riesgo-toggle').click()
    const zona = page.getByTestId('helpdesk-mesa-zona-riesgo')
    await zona.getByTestId('helpdesk-cancelacion-section').waitFor({ timeout: 10_000 })
    await zona.getByTestId('helpdesk-cancelar-proyecto').waitFor({ timeout: 10_000 })
    await zona.getByTestId('helpdesk-delete-project-open').waitFor({ timeout: 10_000 })
    record('Zona de riesgo muestra cancelar y eliminar', true)

    await zona.screenshot({ path: SCREENSHOT })
    record('Screenshot zona de riesgo', true, SCREENSHOT)
  } catch (err) {
    record('Flujo E2E zona de riesgo', false, err instanceof Error ? err.message : String(err))
  } finally {
    await browser.close()
    await cleanup()
    if (viteProcess && !viteProcess.killed) viteProcess.kill('SIGTERM')
    if (backendServer) await new Promise((r) => backendServer.close(r))
  }

  console.log('\n=== Resumen ===')
  for (const row of results) {
    console.log(`${row.ok ? '✅' : '❌'} ${row.label}`)
  }
  process.exit(results.some((r) => !r.ok) ? 1 : 0)
}

main()
