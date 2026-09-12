/**
 * Screenshot de /support con grilla de horarios (5 columnas).
 */
import { spawn } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output/support-grilla-horarios.png')
const VITE_PORT = 5174
const API_PORT = 8799
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`
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

loadEnvFile(resolve(SCRIPTS_DIR, '.env.local'))
loadEnvFile(resolve(SCRIPTS_DIR, '.env'))

const { app } = await import('../lib/server.js')
const server = await new Promise((resolvePromise, reject) => {
  const s = app.listen(API_PORT, '127.0.0.1', (err) => (err ? reject(err) : resolvePromise(s)))
})
await waitForHttpOk(`${API_ORIGIN}/api/health`)

const vite = spawn(
  'npx',
  ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
  {
    cwd: ROOT,
    env: { ...process.env, VITE_API_BASE_URL: API_ORIGIN },
    stdio: 'ignore',
    shell: true,
  },
)
await waitForHttpOk(VITE_ORIGIN)

const { generarTokenSolicitud } = await import('../lib/modules/helpdesk/accessToken.js')
const token = generarTokenSolicitud({
  uid: null,
  email: `screenshot.grid+${Date.now()}@bacarsa.com.ar`,
  nombre: 'Screenshot Grilla',
  areaId: 'r7QVKsrSiqDWC8DrXCac',
  areaNombre: 'Sistemas',
})

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
try {
  await page.goto(`${VITE_ORIGIN}/support?t=${encodeURIComponent(token)}`, {
    waitUntil: 'networkidle',
    timeout: 120_000,
  })
  await page.locator('button:has-text("Libre")').first().waitFor({ timeout: 60_000 })
  const headers = await page.locator('thead th').allTextContents()
  if (headers.length < 6) {
    throw new Error(`Se esperaban 6 columnas en thead, hay ${headers.length}: ${headers.join(' | ')}`)
  }
  mkdirSync(dirname(OUT), { recursive: true })
  await page.locator('section').filter({ hasText: 'Horario de reunión' }).screenshot({ path: OUT })
  console.log(OUT)
} finally {
  await browser.close()
  vite.kill('SIGTERM')
  await new Promise((r) => server.close(r))
}
