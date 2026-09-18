/**
 * Captura screenshots de mesa de ayuda y aprobaciones (UI local mínima).
 */
import { mkdirSync, existsSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const VITE_PORT = 5290 + (Date.now() % 50)
const API_PORT = 8820 + (Date.now() % 50)
const VITE = `http://127.0.0.1:${VITE_PORT}`
const API = `http://127.0.0.1:${API_PORT}`

async function waitOk(url) {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`timeout ${url}`)
}

loadTestEnv()
initAdmin()
const { uid: teamUid } = await getTestIdToken()

mkdirSync(OUT, { recursive: true })
const envDevLocal = resolve(ROOT, '.env.development.local')
const wroteEnv = !existsSync(envDevLocal)
if (wroteEnv) writeFileSync(envDevLocal, `VITE_API_BASE_URL=${API}\n`, 'utf8')

const { app } = await import('../lib/server.js')
const server = await new Promise((resolvePromise, reject) => {
  const instance = app.listen(API_PORT, '127.0.0.1', (error) =>
    error ? reject(error) : resolvePromise(instance),
  )
})
const vite = spawn(
  'npx',
  ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
  { cwd: ROOT, env: { ...process.env, VITE_API_BASE_URL: API }, stdio: 'ignore', shell: true },
)

try {
  await waitOk(`${API}/api/health`)
  await waitOk(VITE)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const customToken = await getAuth().createCustomToken(teamUid)
  await page.goto(VITE, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function')
  await page.evaluate(async (token) => {
    await window.__e2eSignInWithCustomToken(token)
  }, customToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })
  await page.goto(`${VITE}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 60_000 })
  await page.screenshot({
    path: resolve(OUT, 'e2e-mesa-ayuda-analisis.png'),
    fullPage: true,
  })
  await page.goto(`${VITE}/aprobaciones-pendientes`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('aprobaciones-pendientes-modal').waitFor({ timeout: 30_000 })
  await page.screenshot({
    path: resolve(OUT, 'e2e-aprobaciones-pendientes.png'),
    fullPage: true,
  })
  await browser.close()
  console.log('Screenshots en', OUT)
} finally {
  vite.kill('SIGTERM')
  server.close()
  if (wroteEnv && existsSync(envDevLocal)) unlinkSync(envDevLocal)
}
