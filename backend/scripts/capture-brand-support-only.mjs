import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output/brand-verify-03-support.png')
const PREVIEW_PORT = 4174
const API_PORT = 8801
const PREVIEW = `http://127.0.0.1:${PREVIEW_PORT}`
const API = `http://127.0.0.1:${API_PORT}`

function loadEnv(p) {
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
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

async function waitOk(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('timeout ' + url)
}

loadEnv(resolve(SCRIPTS_DIR, '.env.local'))
loadEnv(resolve(SCRIPTS_DIR, '.env'))

const { app } = await import('../lib/server.js')
const server = await new Promise((res, rej) => {
  const s = app.listen(API_PORT, '127.0.0.1', (e) => (e ? rej(e) : res(s)))
})
await waitOk(`${API}/api/health`)

const preview = spawn(
  'npx',
  ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PREVIEW_PORT), '--strictPort'],
  {
    cwd: ROOT,
    env: { ...process.env, VITE_API_BASE_URL: API },
    stdio: 'ignore',
    shell: true,
  },
)
await waitOk(PREVIEW)

const { generarTokenSolicitud } = await import('../lib/modules/helpdesk/accessToken.js')
const token = generarTokenSolicitud({
  email: 'brand.support@bacarsa.com.ar',
  nombre: 'Brand Support',
  areaId: 'brand',
  areaNombre: 'Sistemas',
})

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(`${PREVIEW}/support?t=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => !document.body.innerText.includes('Cargando horarios'), null, {
  timeout: 120_000,
})
mkdirSync(dirname(OUT), { recursive: true })
await page.screenshot({ path: OUT, fullPage: true })
console.log(OUT)
await browser.close()
preview.kill()
await new Promise((r) => server.close(r))
