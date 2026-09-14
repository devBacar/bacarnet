/**
 * Minuta estructurada (Reunión inicial) en panel y Mis proyectos.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/e2e-helpdesk-minuta-diagnostico.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(SCRIPT_DIR, 'output')
const SHOT_PANEL = resolve(OUTPUT_DIR, 'minuta-diagnostico-panel.png')
const SHOT_MIS = resolve(OUTPUT_DIR, 'minuta-diagnostico-mis-proyectos.png')

const VITE_PORT = Number(process.env.E2E_VITE_PORT ?? 5174)
const API_PORT = Number(process.env.HELPDESK_TEST_PORT ?? 8799)
const VITE = `http://127.0.0.1:${VITE_PORT}`
const API = `http://127.0.0.1:${API_PORT}`

async function waitOk(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`timeout ${url}`)
}

loadTestEnv()
initAdmin()
mkdirSync(OUTPUT_DIR, { recursive: true })
const db = getAdminDb()
const auth = getAuth()
const { uid: teamUid, email: teamEmail, idToken: teamIdToken } = await getTestIdToken()
const teamSnapshot = await db.collection('helpdeskTeam').where('activo', '==', true).get()
const teamEmails = new Set(
  teamSnapshot.docs.map((doc) => String(doc.get('email') ?? '').trim().toLowerCase()),
)
/** Si el super_admin de prueba no está en helpdeskTeam, lo agregamos solo para este E2E. */
let e2eTeamBootstrapRef = null
const normalizedTeamEmail = teamEmail.trim().toLowerCase()
if (!teamEmails.has(normalizedTeamEmail)) {
  e2eTeamBootstrapRef = await db.collection('helpdeskTeam').add({
    uid: teamUid,
    nombre: 'E2E minuta diagnóstico',
    email: normalizedTeamEmail,
    rol: 'Analista',
    activo: true,
    primeraReunion: false,
    responsablePrincipal: false,
    createdAt: Timestamp.now(),
  })
}
const usersSnapshot = await db.collection('users').limit(100).get()
let requester = null
for (const userDoc of usersSnapshot.docs) {
  const email = String(userDoc.get('email') ?? '').trim().toLowerCase()
  if (!email || teamEmails.has(email)) continue
  if (userDoc.get('accountType') === 'external' || userDoc.get('active') === false) continue
  try {
    requester = await auth.getUserByEmail(email)
    break
  } catch {
    // skip
  }
}
if (!requester?.email) throw new Error('No se encontró solicitante E2E')

const suffix = Date.now()
const areaNombre = `E2E Minuta Diag ${suffix}`
const proceso1 = `Proceso A ${suffix}`
const proceso2 = `Proceso B ${suffix}`
const ini1 = `Iniciativa Alpha ${suffix}`
const ini2 = `Iniciativa Beta ${suffix}`

const ticketRef = db.collection('helpdeskTickets').doc()
const reunionRef = ticketRef.collection('reuniones').doc()

await ticketRef.set({
  token: 'e2e-minuta-diag-test',
  requesterUid: requester.uid,
  requesterEmail: requester.email,
  requesterNombre: requester.displayName || 'Solicitante E2E',
  areaId: `e2e-${suffix}`,
  areaNombre,
  problematica: 'Verificación minuta diagnóstico',
  urgencia: 'baja',
  estadoIdx: 1,
  asignadoATeamId: null,
  createdAt: Timestamp.now(),
})
await reunionRef.set({
  tipo: 'Reunión inicial',
  fecha: '18/09/2026',
  hora: '10:00',
  conTeamId: 'e2e',
  participantesTeamIds: [],
  estado: 'confirmada',
  createdAt: Timestamp.now(),
})

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
    stdio: 'ignore',
    shell: true,
  },
)
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } })

try {
  await waitOk(`${API}/api/health`)
  await waitOk(VITE)

  const apiTeamProbe = await fetch(`${API}/api/helpdesk/team`, {
    headers: { Authorization: `Bearer ${teamIdToken}`, Accept: 'application/json' },
  })
  if (!apiTeamProbe.ok) {
    const body = await apiTeamProbe.text()
    throw new Error(`API /helpdesk/team ${apiTeamProbe.status}: ${body.slice(0, 400)}`)
  }

  const teamToken = await auth.createCustomToken(teamUid)
  await page.goto(VITE, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function', {
    timeout: 60_000,
  })
  await page.evaluate(async (token) => {
    await window.__e2eSignInWithCustomToken(token)
  }, teamToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })
  const browserApiProbe = await page.evaluate(async (apiBase) => {
    const tokenFn = window.__getIdToken
    if (typeof tokenFn !== 'function') return { ok: false, reason: 'missing __getIdToken' }
    const token = await tokenFn()
    if (!token) return { ok: false, reason: 'no id token in browser' }
    const res = await fetch(`${apiBase}/api/helpdesk/team`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    return { ok: res.ok, status: res.status, body: (await res.text()).slice(0, 200) }
  }, API)
  if (!browserApiProbe.ok) {
    throw new Error(`Browser API probe failed: ${JSON.stringify(browserApiProbe)}`)
  }
  await page.goto(`${VITE}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
  try {
    await page.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 90_000 })
  } catch {
    const snippet = (await page.locator('body').innerText()).slice(0, 600)
    throw new Error(`Panel mesa de ayuda no cargó. Contenido: ${snippet}`)
  }
  await page.getByText(areaNombre, { exact: true }).click()
  await page.getByTestId('helpdesk-mesa-detail').waitFor({ timeout: 30_000 })

  const form = page.getByTestId('helpdesk-minuta-diagnostico-form')
  await form.waitFor({ timeout: 30_000 })

  await page.getByLabel('Facilitador').fill('Facilitador E2E')
  await page.getByLabel('Objetivo de la sesión').fill('Objetivo de prueba automatizada')
  await page.getByLabel('Proceso evaluado').first().fill(proceso1)
  await page.getByRole('button', { name: 'Agregar proceso evaluado' }).click()
  await page.getByLabel('Proceso evaluado').nth(1).fill(proceso2)

  await form.getByLabel('Nombre').first().fill(ini1)
  await page.getByRole('button', { name: 'Agregar iniciativa' }).click()
  await form.getByLabel('Nombre').nth(1).fill(ini2)

  await page.getByTestId('helpdesk-reunion-minuta-save').click()
  await page.getByText('Minuta de diagnóstico guardada', { exact: true }).waitFor({ timeout: 30_000 })
  await page.locator('[data-testid="helpdesk-minuta-diagnostico-form"]').screenshot({ path: SHOT_PANEL })

  const requesterToken = await auth.createCustomToken(requester.uid)
  await page.evaluate((token) => window.__e2eSignInWithCustomToken(token), requesterToken)
  await page.goto(VITE, { waitUntil: 'domcontentloaded' })
  await page.getByText('Sesión activa').waitFor({ timeout: 30_000 })
  await page.goto(`${VITE}/mis-solicitudes-sistemas`, { waitUntil: 'domcontentloaded' })
  const card = page.locator(`[data-ticket-id="${ticketRef.id}"]`)
  await card.waitFor({ timeout: 60_000 })
  const view = card.getByTestId('helpdesk-minuta-diagnostico-view')
  await view.getByText(proceso1).waitFor()
  await view.getByText(ini1).waitFor()
  await view.getByText('Viable', { exact: true }).first().waitFor()
  await card.screenshot({ path: SHOT_MIS })

  console.log(
    JSON.stringify({
      ticketId: ticketRef.id,
      reunionId: reunionRef.id,
      screenshots: { panel: SHOT_PANEL, misProyectos: SHOT_MIS },
    }),
  )
  console.log('PASS: minuta diagnóstico panel + Mis proyectos')
} finally {
  await browser.close()
  vite.kill('SIGTERM')
  await new Promise((resolvePromise) => server.close(resolvePromise))
  await db.recursiveDelete(ticketRef)
  if (e2eTeamBootstrapRef) await e2eTeamBootstrapRef.delete().catch(() => {})
}
