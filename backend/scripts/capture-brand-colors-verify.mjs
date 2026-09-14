/**
 * Screenshots post-fix colores: login (Google), intranet (clima), /support.
 *
 *   npm run build
 *   node backend/scripts/capture-brand-colors-verify.mjs
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'
import { generateEphemeralPassword } from './lib/testSecrets.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const PREVIEW_PORT = 4173
const API_PORT = 8800
const PREVIEW_ORIGIN = `http://127.0.0.1:${PREVIEW_PORT}`
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1)
    if (process.env[k] === undefined) process.env[k] = v
  }
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
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Timeout ${url}`)
}

async function loginWithPassword(page, email, password) {
  await page.goto(`${PREVIEW_ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.locator('#login-email').waitFor({ timeout: 60_000 })
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page
    .locator('form')
    .filter({ has: page.locator('#login-email') })
    .getByRole('button', { name: /^iniciar sesión$/i })
    .click()
  await page.getByText(/Sesión activa/i).waitFor({ timeout: 90_000 })
  await page.goto(`${PREVIEW_ORIGIN}/intranet`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
}

loadEnvFile(resolve(SCRIPTS_DIR, '.env.local'))
loadEnvFile(resolve(SCRIPTS_DIR, '.env'))

const { app } = await import('../lib/server.js')
const server = await new Promise((resolvePromise, reject) => {
  const s = app.listen(API_PORT, '127.0.0.1', (err) => (err ? reject(err) : resolvePromise(s)))
})
await waitForHttpOk(`${API_ORIGIN}/api/health`)

const preview = spawn(
  'npx',
  ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PREVIEW_PORT), '--strictPort'],
  {
    cwd: ROOT,
    env: { ...process.env, VITE_API_BASE_URL: API_ORIGIN },
    stdio: 'ignore',
    shell: true,
  },
)
await waitForHttpOk(PREVIEW_ORIGIN)

loadTestEnv()
initAdmin()
const admin = await getTestIdToken()
const tempPassword = generateEphemeralPassword()
await getAuth().updateUser(admin.uid, { password: tempPassword })

const { generarTokenSolicitud } = await import('../lib/modules/helpdesk/accessToken.js')
const supportToken = generarTokenSolicitud({
  email: 'screenshot.brand@bacarsa.com.ar',
  nombre: 'Brand Verify',
  areaId: 'brand-verify',
  areaNombre: 'Sistemas',
})

mkdirSync(OUT_DIR, { recursive: true })
const shots = {
  loginGoogle: resolve(OUT_DIR, 'brand-verify-01-login-google.png'),
  intranetHub: resolve(OUT_DIR, 'brand-verify-02-intranet-hub.png'),
  support: resolve(OUT_DIR, 'brand-verify-03-support.png'),
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

try {
  await page.goto(`${PREVIEW_ORIGIN}/`, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.getByRole('button', { name: /continuar con google/i }).waitFor({ timeout: 30_000 })
  await page.locator('.auth-panel').screenshot({ path: shots.loginGoogle })

  await loginWithPassword(page, admin.email, tempPassword)
  await page.getByText(/¡Hola,/i).first().waitFor({ timeout: 60_000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: shots.intranetHub, fullPage: true })

  await page.goto(`${PREVIEW_ORIGIN}/support?t=${encodeURIComponent(supportToken)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  })
  await page.waitForFunction(() => !document.body.innerText.includes('Cargando horarios'), null, {
    timeout: 120_000,
  })
  await page.waitForTimeout(800)
  await page.screenshot({ path: shots.support, fullPage: true })

  console.log(JSON.stringify(shots, null, 2))
} finally {
  await browser.close()
  preview.kill('SIGTERM')
  await new Promise((r) => server.close(r))
}
