/**
 * E2E autenticado /mis-solicitudes-sistemas (Playwright).
 *
 *   npm --prefix backend run build
 *   node backend/scripts/e2e-helpdesk-mis-solicitudes.mjs
 */

import { spawn } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getTestIdToken, initAdmin, getAdminDb, loadTestEnv } from './get-test-token.mjs'
import { deleteHelpdeskTicketFull } from './helpdesk-e2e-cleanup.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(SCRIPT_DIR, 'output')
const SCREENSHOT_PATH = resolve(OUTPUT_DIR, 'mis-solicitudes-sistemas.png')

const VITE_PORT = Number(process.env.E2E_VITE_PORT ?? 5174)
const API_PORT = Number(process.env.HELPDESK_TEST_PORT ?? 8799)
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`

const E2E_AREA = 'E2E Mis Solicitudes Sistemas'
const E2E_REUNION_TIPO = 'Reunión inicial E2E'

const results = []
/** IDs creados en esta corrida (limpieza en finally aunque falle el test). */
const sessionTicketIds = new Set()

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
  console.log(`API local E2E en ${API_ORIGIN}`)
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
  console.log(`Vite E2E en ${VITE_ORIGIN} → API ${API_ORIGIN}`)
  return child
}

async function seedTicketForUser({ uid, email }) {
  initAdmin()
  const db = getAdminDb()
  const teamSnap = await db.collection('helpdeskTeam').where('activo', '==', true).limit(1).get()
  if (teamSnap.empty) {
    throw new Error('No hay miembros activos en helpdeskTeam para la prueba')
  }
  const assigneeDoc = teamSnap.docs[0]
  const assigneeId = assigneeDoc.id
  const assigneeNombre = assigneeDoc.get('nombre') ?? 'Referente Sistemas'

  const ticketRef = db.collection('helpdeskTickets').doc()
  const ticketId = ticketRef.id
  sessionTicketIds.add(ticketId)

  await ticketRef.set({
    token: 'e2e-mis-solicitudes-token',
    requesterUid: uid,
    requesterEmail: email,
    requesterNombre: 'E2E Mis Solicitudes',
    areaId: 'test-area-e2e',
    areaNombre: E2E_AREA,
    problematica: 'Ticket E2E mis solicitudes — ignorar',
    urgencia: 'media',
    estadoIdx: 2,
    asignadoATeamId: assigneeId,
    createdAt: FieldValue.serverTimestamp(),
  })

  await ticketRef.collection('reuniones').doc().set({
    tipo: E2E_REUNION_TIPO,
    fecha: '15/09/2026',
    hora: '10:00',
    conTeamId: assigneeId,
    participantesTeamIds: [],
    estado: 'pendiente',
    createdAt: FieldValue.serverTimestamp(),
  })

  return { assigneeNombre, ticketId }
}

async function cleanupSessionTickets() {
  if (sessionTicketIds.size === 0) {
    record('Limpieza ticket E2E', false, 'sin ticketId en sesión')
    return
  }
  let allOk = true
  for (const id of sessionTicketIds) {
    const ok = await deleteHelpdeskTicketFull(id)
    if (!ok) allOk = false
  }
  sessionTicketIds.clear()
  record('Limpieza ticket E2E', allOk)
}

async function signInWithCustomToken(page, uid) {
  const customToken = await getAuth().createCustomToken(uid)

  await page.goto(`${VITE_ORIGIN}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => typeof window.__e2eSignInWithCustomToken === 'function',
    { timeout: 30_000 },
  )
  await page.evaluate(async (token) => {
    await window.__e2eSignInWithCustomToken(token)
  }, customToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })
}

async function runPlaywright({ uid, assigneeNombre }) {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await signInWithCustomToken(page, uid)

    const apiResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/helpdesk/tickets/mias') &&
        res.request().method() === 'GET' &&
        res.status() !== 0,
      { timeout: 60_000 },
    )

    await page.goto(`${VITE_ORIGIN}/mis-solicitudes-sistemas`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    })

    const res = await apiResponse
    record('GET /api/helpdesk/tickets/mias responde 200', res.status() === 200, `status ${res.status()}`)

    const card = page.locator('[data-testid="helpdesk-mis-solicitud-card"]').first()
    await card.waitFor({ state: 'visible', timeout: 30_000 })

    const cardText = await card.innerText()
    const hasArea = cardText.includes(E2E_AREA)
    const hasUrgencia = /Urgencia\s+Media/i.test(cardText)
    const hasAssignee = cardText.includes(assigneeNombre)
    const hasReunion =
      cardText.includes(E2E_REUNION_TIPO) &&
      cardText.includes('15/09/2026') &&
      cardText.includes('10:00')

    record('Tarjeta muestra área de prueba', hasArea)
    record('Tarjeta muestra urgencia media', hasUrgencia)
    record('Tarjeta muestra referente Sistemas', hasAssignee, assigneeNombre)
    record('Tarjeta lista reunión con fecha y hora', hasReunion)

    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true })
    record('Screenshot guardado', existsSync(SCREENSHOT_PATH), SCREENSHOT_PATH)
  } catch (err) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
    await page
      .screenshot({ path: resolve(OUTPUT_DIR, 'mis-solicitudes-e2e-failure.png'), fullPage: true })
      .catch(() => {})
    throw err
  } finally {
    await browser.close()
  }
}

async function main() {
  loadTestEnv()

  let backendServer = null
  let viteProcess = null

  try {
    backendServer = await ensureBackendListening()
    viteProcess = await ensureViteDev()

    const { uid, email } = await getTestIdToken()
    const { assigneeNombre } = await seedTicketForUser({ uid, email })
    await runPlaywright({ uid, assigneeNombre })
  } catch (err) {
    console.error('\nError E2E:', err)
    record('Ejecución E2E', false, err instanceof Error ? err.message : String(err))
  } finally {
    try {
      await cleanupSessionTickets()
    } catch (cleanupErr) {
      record('Limpieza ticket E2E', false, String(cleanupErr))
    }
    if (viteProcess && !viteProcess.killed) viteProcess.kill('SIGTERM')
    if (backendServer) await new Promise((r) => backendServer.close(r))
  }

  console.log('\n=== Resumen E2E /mis-solicitudes-sistemas ===')
  for (const row of results) {
    console.log(`${row.ok ? '✅' : '❌'} ${row.label}${row.detail ? ` — ${row.detail}` : ''}`)
  }
  if (existsSync(SCREENSHOT_PATH)) {
    console.log(`\nScreenshot: ${SCREENSHOT_PATH}`)
  }
  process.exit(results.some((r) => !r.ok) ? 1 : 0)
}

main()
