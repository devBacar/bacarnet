/**
 * Captura del widget Gmail con asunto largo (mock de API).
 *
 *   node backend/scripts/capture-gmail-subject-layout.mjs
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { getAuth } from 'firebase-admin/auth'
import { chromium } from 'playwright'
import { getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const LONG_SUBJECT =
  'Re: URGENTE — Revisión presupuesto Q3 Seguridad Privada + coordinación con RRHH y compras (seguimiento reunión 14/09)'

const VITE_PORT = 5191
const API_PORT = 8795
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
  const { uid } = await getTestIdToken()
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 420, height: 720 } })

  await page.route('**/api/me/google/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ connected: true }),
    })
  })
  await page.route('**/api/me/gmail/messages', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        messages: [
          {
            id: 'mock-1',
            from: 'Marcela Santucho',
            subject: LONG_SUBJECT,
          },
        ],
      }),
    })
  })

  const customToken = await getAuth().createCustomToken(uid)
  await page.goto(`${VITE}/intranet`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function')
  await page.evaluate(async (t) => {
    await window.__e2eSignInWithCustomToken(t)
  }, customToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })
  await page.goto(`${VITE}/intranet`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Gmail', { exact: true }).first().waitFor({ timeout: 60_000 })

  const gmailCard = page.locator('section.card-minimal').filter({ hasText: 'Gmail' }).first()
  await page.getByTestId('gmail-message-subject').waitFor({ timeout: 30_000 })
  const widget = gmailCard
  mkdirSync(OUT, { recursive: true })

  await page.evaluate(() => {
    document.querySelectorAll('[data-testid="gmail-message-subject"]').forEach((el) => {
      el.className = 'truncate text-sm text-zinc-400 dark:text-zinc-500'
    })
  })
  await widget.screenshot({ path: resolve(OUT, 'gmail-subject-before-truncate.png') })

  await page.evaluate(() => {
    document.querySelectorAll('[data-testid="gmail-message-subject"]').forEach((el) => {
      el.className = 'line-clamp-2 text-sm leading-snug text-zinc-400 dark:text-zinc-500'
    })
  })
  await widget.screenshot({ path: resolve(OUT, 'gmail-subject-line-clamp-2.png') })
  console.log('OK', resolve(OUT, 'gmail-subject-before-truncate.png'))
  console.log('OK', resolve(OUT, 'gmail-subject-line-clamp-2.png'))
  await browser.close()
} finally {
  vite.kill('SIGTERM')
  await new Promise((resolvePromise) => server.close(() => resolvePromise()))
}
