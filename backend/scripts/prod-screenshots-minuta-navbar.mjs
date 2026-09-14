/**
 * Screenshots en bacarnet.web.app (ticket sembrado vía Admin, sin rate limit público).
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { chromium } from 'playwright'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'
import { deleteHelpdeskTicketFull } from './helpdesk-e2e-cleanup.mjs'

const PROD_APP = 'https://bacarnet.web.app'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output/prod-minuta-ia')

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

try {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const customToken = await getAuth().createCustomToken(uid)
  await page.addInitScript(() => {
    sessionStorage.setItem('__allow_e2e_signin', '1')
  })
  await page.goto(`${PROD_APP}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function', {
    timeout: 120_000,
  })
  await page.evaluate(async (t) => {
    await window.__e2eSignInWithCustomToken(t)
  }, customToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 120_000 })
  await page.goto(`${PROD_APP}/intranet`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('link', { name: 'Aprobaciones pendientes' }).waitFor({ timeout: 60_000 })
  await page.screenshot({ path: resolve(OUT, 'prod-navbar-aprobaciones-link.png') })
  await page.goto(`${PROD_APP}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
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
  await page.goto(`${PROD_APP}/aprobaciones-pendientes`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('aprobaciones-pendientes-page').waitFor({ timeout: 60_000 })
  await page.screenshot({ path: resolve(OUT, 'prod-navbar-aprobaciones-page.png'), fullPage: true })
  await browser.close()
  console.log('Screenshots OK en', OUT)
} finally {
  await deleteHelpdeskTicketFull(ticketId)
}
