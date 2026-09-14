/**
 * Screenshot /aprobaciones-pendientes (mismo stack E2E que mesa-ayuda).
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
const VITE_PORT = Number(process.env.E2E_VITE_PORT ?? 5176)
const API_PORT = Number(process.env.HELPDESK_TEST_PORT ?? 8796)
const VITE = `http://127.0.0.1:${VITE_PORT}`
const API = `http://127.0.0.1:${API_PORT}`

async function waitOk(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`timeout ${url}`)
}

loadTestEnv()
initAdmin()
mkdirSync(OUT, { recursive: true })

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

try {
  await waitOk(`${API}/api/health`)
  await waitOk(VITE)
  const { uid } = await getTestIdToken()
  const customToken = await getAuth().createCustomToken(uid)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  page.setDefaultTimeout(90_000)
  await page.goto(`${VITE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function')
  await page.evaluate(async (token) => {
    await window.__e2eSignInWithCustomToken(token)
  }, customToken)
  await page.getByText('Sesión activa').waitFor()
  await page.goto(`${VITE}/aprobaciones-pendientes`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('aprobaciones-pendientes-page').waitFor()
  await page.getByText('No tenés análisis pendientes').waitFor({ timeout: 60_000 })
  await page.screenshot({
    path: resolve(OUT, 'e2e-aprobaciones-pendientes.png'),
    fullPage: true,
  })
  await browser.close()
  console.log('OK')
} finally {
  vite.kill('SIGTERM')
  server.close()
}
