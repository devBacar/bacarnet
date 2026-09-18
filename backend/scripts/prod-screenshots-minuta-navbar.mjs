/**
 * Screenshots en bacarnet.web.app (ticket sembrado vía Admin, sin rate limit público).
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
const PROD_API =
  process.env.FUNCTIONS_API_BASE?.replace(/\/+$/, '') ||
  'https://southamerica-east1-bacar-web.cloudfunctions.net/api'
const VITE_PORT = 5191
const VITE = `http://127.0.0.1:${VITE_PORT}`
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output/prod-minuta-ia')

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
const { uid } = await getTestIdToken()

const ticketRef = db.collection('helpdeskTickets').doc()
const reunionRef = ticketRef.collection('reuniones').doc()
const ticketId = ticketRef.id

await ticketRef.set({
  token: 'prod-screenshot-seed',
  requesterUid: uid,
  requesterEmail: 'admin@bacarsa.com.ar',
  requesterNombre: 'E2E PROD Screenshot',
  areaId: 'e2e-prod-shot',
  areaNombre: 'E2E PROD Minuta IA',
  problematica: 'Pedidos en Excel entre Ventas y Finanzas.',
  urgencia: 'media',
  estadoIdx: 1,
  asignadoATeamId: null,
  createdAt: Timestamp.now(),
})
await reunionRef.set({
  tipo: 'Reunión inicial',
  fecha: '22/09/2026',
  hora: '10:00',
  conTeamId: 'x',
  participantesTeamIds: [],
  estado: 'pendiente',
  minutaDiagnostico: {
    fecha: '',
    facilitador: '',
    participantes: '',
    objetivoSesion:
      'Alinear el entendimiento del flujo de pedidos entre Ventas y Finanzas antes de la reunión de diagnóstico.',
    alcance: 'Registro de pedidos, handoff a Finanzas y conciliación manual actual.',
    procesosEvaluados: [
      {
        procesoEvaluado: 'Registro de pedidos (Ventas)',
        descripcionBreve: 'Carga en planillas y envío a Finanzas.',
        problemasIdentificados: '',
        metricasActuales: '',
      },
    ],
    iniciativasPropuestas: [],
    proyectosAprobados: '',
    responsables: '',
    accionesInmediatas: '',
    generadoPorIA: true,
    updatedAt: Timestamp.now(),
  },
  createdAt: Timestamp.now(),
})

const vite = spawn(
  'npx',
  ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
  {
    cwd: ROOT,
    env: { ...process.env, VITE_API_BASE_URL: PROD_API },
    shell: true,
    stdio: 'ignore',
  },
)

try {
  await waitOk(VITE)
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const customToken = await getAuth().createCustomToken(uid)
  await page.goto(`${VITE}/intranet`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function', {
    timeout: 120_000,
  })
  await page.evaluate(async (t) => {
    await window.__e2eSignInWithCustomToken(t)
  }, customToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 120_000 })
  await page.goto(`${VITE}/intranet`, { waitUntil: 'domcontentloaded' })
  const aprobacionesNav = page.getByRole('link', { name: 'Aprobaciones pendientes' })
  if ((await aprobacionesNav.count()) > 0) {
    throw new Error('Navbar no debe mostrar link Aprobaciones pendientes')
  }
  await page.screenshot({ path: resolve(OUT, 'prod-navbar-sin-aprobaciones-link.png') })
  await page.goto(`${VITE}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 120_000 })
  await page.getByTestId('helpdesk-mesa-ticket-row').filter({ hasText: 'E2E PROD Minuta IA' }).first().click()
  await page.getByTestId('helpdesk-mesa-detail').waitFor()
  const minutaSummary = page.locator('[data-testid="helpdesk-reunion-minuta"]').first()
  if (await minutaSummary.evaluate((el) => !(el instanceof HTMLDetailsElement) || !el.open)) {
    await minutaSummary.locator('summary').click()
  }
  await page.getByTestId('helpdesk-mesa-detail-scroll').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await page.getByTestId('helpdesk-minuta-diagnostico-form').scrollIntoViewIfNeeded()
  await page.getByTestId('helpdesk-minuta-diagnostico-form').waitFor({ timeout: 60_000 })
  await page.getByTestId('helpdesk-minuta-ia-banner').waitFor({ timeout: 30_000 })
  await page.screenshot({ path: resolve(OUT, 'prod-mesa-minuta-estructurada.png'), fullPage: true })
  await page.getByTestId('helpdesk-minuta-diagnostico-form').screenshot({
    path: resolve(OUT, 'prod-minuta-form-closeup.png'),
  })
  await page.goto(`${VITE}/aprobaciones-pendientes`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('aprobaciones-pendientes-modal').waitFor({ timeout: 60_000 })
  await page.screenshot({ path: resolve(OUT, 'prod-aprobaciones-modal.png'), fullPage: false })
  await browser.close()
  console.log('Screenshots OK en', OUT, '(Vite dev + API prod; no login helper en hosting)')
} finally {
  vite.kill('SIGTERM')
  await deleteHelpdeskTicketFull(ticketId)
}
