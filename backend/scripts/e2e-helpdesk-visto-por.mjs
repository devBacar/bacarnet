/**
 * E2E: indicador de novedades por persona en mesa de ayuda.
 *
 *   node backend/scripts/e2e-helpdesk-visto-por.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { chromium } from 'playwright'
import { deleteHelpdeskTicketFull } from './helpdesk-e2e-cleanup.mjs'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const SCREENSHOT = resolve(OUT, 'helpdesk-visto-por-dots.png')

const VITE_PORT = Number(process.env.E2E_VITE_PORT ?? 5175)
const API_PORT = Number(process.env.HELPDESK_TEST_PORT ?? 8800)
const VITE = `http://127.0.0.1:${VITE_PORT}`
const API = `http://127.0.0.1:${API_PORT}`

const E2E_AREA = 'E2E Visto Por Novedades'
const BITACORA_TEXTO = `Avance visto-por ${Date.now()}`

const results = []
function record(label, ok, detail = '') {
  results.push({ label, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
}

async function waitOk(url, ms = 120_000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`timeout ${url}`)
}

async function signIn(page, customToken) {
  await page.goto(`${VITE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function', {
    timeout: 120_000,
  })
  await page.evaluate(async (t) => {
    await window.__e2eSignInWithCustomToken(t)
  }, customToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })
}

async function ensureTeamUser({ label, emailPrefix }) {
  initAdmin()
  const auth = getAuth()
  const db = getAdminDb()
  const email = `${emailPrefix}+${Date.now()}@bacarsa.com.ar`
  const user = await auth.createUser({ email, emailVerified: true })
  await db.collection('users').doc(user.uid).set({
    email,
    displayName: label,
    department: 'Sistemas',
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
  const teamRef = db.collection('helpdeskTeam').doc()
  await teamRef.set({
    uid: user.uid,
    nombre: label,
    email,
    rol: 'E2E',
    activo: true,
    primeraReunion: false,
    responsablePrincipal: false,
    createdAt: FieldValue.serverTimestamp(),
  })
  return { uid: user.uid, email, teamDocId: teamRef.id, auth }
}

loadTestEnv()

let ticketId = null
let franco = null
let mauro = null
let server = null
let vite = null

try {
  mkdirSync(OUT, { recursive: true })

  franco = await ensureTeamUser({ label: 'E2E Franco', emailPrefix: 'e2e.franco' })
  mauro = await ensureTeamUser({ label: 'E2E Mauro', emailPrefix: 'e2e.mauro' })

  const db = getAdminDb()
  const ticketRef = db.collection('helpdeskTickets').doc()
  ticketId = ticketRef.id
  await ticketRef.set({
    token: `e2e-vp-${ticketId.slice(0, 6)}`,
    requesterUid: 'e2e-requester',
    requesterEmail: 'e2e.requester@bacarsa.com.ar',
    requesterNombre: 'E2E Requester',
    areaId: 'e2e-visto-por',
    areaNombre: E2E_AREA,
    problematica: 'Ticket prueba novedades por persona',
    urgencia: 'media',
    estadoIdx: 4,
    asignadoATeamId: franco.teamDocId,
    cancelado: false,
    createdAt: FieldValue.serverTimestamp(),
    seguimientoUpdatedAt: FieldValue.serverTimestamp(),
  })

  const { app } = await import('../lib/server.js')
  server = await new Promise((resolvePromise, reject) => {
    const s = app.listen(API_PORT, '127.0.0.1', (err) => (err ? reject(err) : resolvePromise(s)))
  })
  vite = spawn(
    'npx',
    ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
    {
      cwd: ROOT,
      env: { ...process.env, VITE_API_BASE_URL: API, VITE_E2E: 'true' },
      stdio: 'ignore',
      shell: true,
    },
  )
  await waitOk(`${API}/api/health`)
  await waitOk(VITE)

  const francoToken = await franco.auth.createCustomToken(franco.uid)
  const bitacoraRes = await fetch(`${API}/api/helpdesk/tickets/${ticketId}/bitacora`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await idTokenFromCustom(francoToken)}` },
    body: (() => {
      const form = new FormData()
      form.append('texto', BITACORA_TEXTO)
      return form
    })(),
  })
  if (!bitacoraRes.ok) {
    throw new Error(`bitacora post: ${await bitacoraRes.text()}`)
  }
  record('Franco publica avance en bitácora', true)

  const browser = await chromium.launch({ headless: true })
  const pageFranco = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await signIn(pageFranco, francoToken)
  await pageFranco.goto(`${VITE}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
  await pageFranco.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 60_000 })
  await pageFranco.getByTestId('helpdesk-mesa-ticket-row').filter({ hasText: E2E_AREA }).first().click()
  await pageFranco.getByTestId('helpdesk-mesa-detail').waitFor({ timeout: 30_000 })
  const francoBitacoraDot = pageFranco.getByTestId('helpdesk-section-novedad-bitacora')
  record('Franco no ve punto en bitácora (autor)', (await francoBitacoraDot.count()) === 0)

  const mauroToken = await mauro.auth.createCustomToken(mauro.uid)
  const pageMauro = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await signIn(pageMauro, mauroToken)
  await pageMauro.goto(`${VITE}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
  await pageMauro.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 60_000 })
  await pageMauro.getByTestId('helpdesk-mesa-ticket-row').filter({ hasText: E2E_AREA }).first().click()
  await pageMauro.getByTestId('helpdesk-mesa-detail').waitFor({ timeout: 30_000 })

  await pageMauro.getByTestId('helpdesk-section-novedad-bitacora').waitFor({ timeout: 15_000 })
  record('Mauro ve punto en bitácora', true)

  await pageMauro.getByTestId('helpdesk-section-novedad-seguimiento').waitFor({ timeout: 10_000 })
  record('Mauro ve punto en seguimiento (sin haberlo abierto)', true)

  await pageMauro.screenshot({ path: SCREENSHOT, fullPage: true })
  record('Screenshot con indicadores', existsSync(SCREENSHOT))

  await pageMauro.getByTestId('helpdesk-mesa-bitacora-toggle').click()
  await pageMauro.getByTestId('helpdesk-bitacora-section').waitFor({ timeout: 15_000 })
  await pageMauro.waitForTimeout(400)
  record(
    'Punto bitácora desaparece al expandir (Mauro)',
    (await pageMauro.getByTestId('helpdesk-section-novedad-bitacora').count()) === 0,
  )

  await browser.close()
} catch (err) {
  console.error(err)
  record('Ejecución E2E visto-por', false, err instanceof Error ? err.message : String(err))
} finally {
  if (vite && !vite.killed) vite.kill('SIGTERM')
  if (server) await new Promise((r) => server.close(r))
  if (ticketId) await deleteHelpdeskTicketFull(ticketId).catch(() => {})
  for (const u of [franco, mauro]) {
    if (!u) continue
    await u.auth.deleteUser(u.uid).catch(() => {})
    await getAdminDb().collection('users').doc(u.uid).delete().catch(() => {})
    await getAdminDb().collection('helpdeskTeam').doc(u.teamDocId).delete().catch(() => {})
  }
}

process.exit(results.some((r) => !r.ok) ? 1 : 0)

async function idTokenFromCustom(customToken) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY?.trim()
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  )
  const body = await res.json()
  if (!body.idToken) throw new Error(JSON.stringify(body))
  return body.idToken
}
