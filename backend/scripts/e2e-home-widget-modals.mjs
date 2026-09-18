/**
 * E2E modales Gmail/Calendar en Home.
 *
 *   npm run build
 *   node backend/scripts/e2e-home-widget-modals.mjs
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const PORT = 5202

const LIST_BODY =
  'Este es el cuerpo completo del correo de prueba. En la tarjeta del widget solo ves el asunto resumido; acá debe aparecer todo el texto extendido con más contexto para la verificación E2E.'

loadTestEnv()
initAdmin()

async function waitOk(url) {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`timeout ${url}`)
}

async function signIn(page, uid) {
  const custom = await getAuth().createCustomToken(uid)
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function', {
    timeout: 120_000,
  })
  await page.evaluate(async (t) => window.__e2eSignInWithCustomToken(t), custom)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })
}

function mockWidgetsApi(page) {
  page.route('**/api/me/google/status', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: true }) })
  })
  page.route('**/api/me/gmail/messages/msg-e2e-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: {
          id: 'msg-e2e-1',
          from: 'Equipo Sistemas <sistemas.ti@bacarsa.com.ar>',
          subject: 'Asunto completo del correo E2E widgets',
          date: new Date().toISOString(),
          bodyText: LIST_BODY,
          bodyHtml: null,
          gmailWebUrl: 'https://mail.google.com/mail/u/0/#inbox/msg-e2e-1',
        },
      }),
    })
  })
  page.route('**/api/me/gmail/messages', async (route) => {
    if (route.request().url().includes('/messages/msg-')) return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        messages: [{ id: 'msg-e2e-1', from: 'Equipo Sistemas', subject: 'Preview corto en tarjeta' }],
      }),
    })
  })
  page.route('**/api/me/calendar/eventos/ev-e2e-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        event: {
          id: 'ev-e2e-1',
          summary: 'Reunión de seguimiento E2E',
          start: new Date().toISOString(),
          end: new Date(Date.now() + 3600000).toISOString(),
          allDay: false,
          location: 'Sala 3 · Planta baja',
          description: 'Descripción completa del evento con agenda detallada y notas que no aparecen en la tarjeta del widget.',
          attendees: [
            { email: 'a@bacarsa.com.ar', displayName: 'Ana', responseStatus: 'Aceptado' },
            { email: 'b@bacarsa.com.ar', displayName: null, responseStatus: 'Pendiente' },
          ],
          calendarWebUrl: 'https://www.google.com/calendar/event?eid=e2e',
        },
      }),
    })
  })
  page.route('**/api/me/calendar/eventos', async (route) => {
    if (route.request().url().match(/\/eventos\/[^/?]+/)) return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        events: [{ id: 'ev-e2e-1', summary: 'Reunión E2E', startTime: '10:00' }],
      }),
    })
  })
}

async function assertModalCloses(page, modalTestId) {
  const modal = page.getByTestId(modalTestId)
  await modal.getByTestId(`${modalTestId}-close`).click()
  await modal.waitFor({ state: 'hidden' })

  await page.getByTestId('gmail-widget-item').first().click()
  await modal.waitFor()
  await page.keyboard.press('Escape')
  await modal.waitFor({ state: 'hidden' })

  await page.getByTestId('gmail-widget-item').first().click()
  await modal.waitFor()
  await page.getByTestId(`${modalTestId}-backdrop`).click({ position: { x: 8, y: 8 } })
  await modal.waitFor({ state: 'hidden' })
}

mkdirSync(OUT, { recursive: true })

const vite = spawn(
  'npx',
  ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: 'ignore', shell: true, env: { ...process.env, VITE_E2E: 'true' } },
)

try {
  await waitOk(`http://127.0.0.1:${PORT}/`)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  const { uid } = await getTestIdToken()
  await signIn(page, uid)
  mockWidgetsApi(page)
  await page.goto(`http://127.0.0.1:${PORT}/intranet`, { waitUntil: 'domcontentloaded' })

  await page.getByTestId('gmail-widget-item').first().click()
  const gmailModal = page.getByTestId('gmail-widget-modal')
  await gmailModal.waitFor()
  await page.getByTestId('gmail-modal-subject').waitFor()
  const body = await page.getByTestId('gmail-modal-body').innerText()
  if (!body.includes('cuerpo completo')) {
    throw new Error('Modal Gmail no muestra cuerpo completo')
  }
  if (body.includes('Preview corto')) {
    throw new Error('Modal Gmail muestra solo preview de tarjeta')
  }
  await gmailModal.screenshot({ path: resolve(OUT, 'home-gmail-widget-modal.png') })
  await assertModalCloses(page, 'gmail-widget-modal')
  console.log('✅ Gmail modal contenido y cierre')

  await page.getByTestId('calendar-widget-item').first().click()
  const calModal = page.getByTestId('calendar-widget-modal')
  await calModal.waitFor()
  await page.getByTestId('calendar-modal-description').waitFor()
  const desc = await page.getByTestId('calendar-modal-description').innerText()
  if (!desc.includes('Descripción completa')) {
    throw new Error('Modal Calendar sin descripción completa')
  }
  await calModal.screenshot({ path: resolve(OUT, 'home-calendar-widget-modal.png') })
  await page.getByTestId('calendar-widget-modal-close').click()
  await calModal.waitFor({ state: 'hidden' })
  console.log('✅ Calendar modal contenido')

  await browser.close()
  console.log('OK screenshots:', resolve(OUT, 'home-gmail-widget-modal.png'))
} finally {
  if (!vite.killed) vite.kill('SIGTERM')
}
