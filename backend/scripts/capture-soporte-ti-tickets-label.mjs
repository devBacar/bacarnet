/**
 * Capturas Navbar + página /soporte-ti con label "Tickets".
 *
 *   npm run build
 *   node backend/scripts/capture-soporte-ti-tickets-label.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const PORT = 5176

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

async function signIn(page, email) {
  const custom = await getAuth().createCustomToken((await getAuth().getUserByEmail(email)).uid)
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function')
  await page.evaluate(async (t) => window.__e2eSignInWithCustomToken(t), custom)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })
}

mkdirSync(OUT, { recursive: true })

const vite = spawn(
  'npx',
  ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { cwd: ROOT, stdio: 'ignore', shell: true },
)

try {
  await waitOk(`http://127.0.0.1:${PORT}/`)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await signIn(page, 'admin@bacarsa.com.ar')
  await page.goto(`http://127.0.0.1:${PORT}/soporte-ti`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Tickets', exact: true }).waitFor({ timeout: 60_000 })
  await page.locator('header').first().screenshot({
    path: resolve(OUT, 'tickets-navbar-desktop.png'),
  })
  await page.locator('main').screenshot({
    path: resolve(OUT, 'tickets-page-h1.png'),
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`http://127.0.0.1:${PORT}/intranet`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Abrir menú de navegación' }).click()
  await page.getByRole('link', { name: 'Tickets' }).waitFor({ timeout: 15_000 })
  await page.screenshot({ path: resolve(OUT, 'tickets-navbar-mobile.png'), fullPage: false })

  await browser.close()
  console.log('OK:', resolve(OUT, 'tickets-navbar-desktop.png'))
  console.log('OK:', resolve(OUT, 'tickets-page-h1.png'))
  console.log('OK:', resolve(OUT, 'tickets-navbar-mobile.png'))
} finally {
  if (!vite.killed) vite.kill('SIGTERM')
}
