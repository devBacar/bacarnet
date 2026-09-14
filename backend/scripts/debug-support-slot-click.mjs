/**
 * Reproduce blank page on slot click (console + network).
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const API_PORT = 8799
const VITE_PORT = 5174
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`

function loadEnv() {
  for (const p of [resolve(SCRIPTS_DIR, '.env.local'), resolve(SCRIPTS_DIR, '.env')]) {
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq <= 0) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (process.env[k] === undefined) process.env[k] = v
    }
  }
}

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('timeout ' + url)
}

loadEnv()
const useProd = process.argv.includes('--prod')
const { generarTokenSolicitud } = await import('../lib/modules/helpdesk/accessToken.js')
const token = generarTokenSolicitud({
  email: 'sistemas.ti@bacarsa.com.ar',
  nombre: 'Debug Slot',
  areaId: 'unknown',
  areaNombre: 'Sistemas',
})

let apiServer = null
let vite = null
if (!useProd) {
  const { app } = await import('../lib/server.js')
  apiServer = await new Promise((res, rej) => {
    const s = app.listen(API_PORT, '127.0.0.1', (e) => (e ? rej(e) : res(s)))
  })
  await waitFor(`${API_ORIGIN}/api/health`)
  vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'], {
    cwd: ROOT,
    env: { ...process.env, VITE_API_BASE_URL: API_ORIGIN },
    shell: true,
    stdio: 'ignore',
  })
  await waitFor(VITE_ORIGIN)
}

const logs = { console: [], pageerror: [], failed: [] }
const browser = await chromium.launch()
const page = await browser.newPage()
page.on('console', (msg) => logs.console.push({ type: msg.type(), text: msg.text() }))
page.on('pageerror', (err) => logs.pageerror.push(String(err)))
page.on('response', (res) => {
  if (res.status() >= 400) logs.failed.push(`${res.status()} ${res.url()}`)
})

const url = useProd
  ? `https://bacarnet.web.app/support?t=${encodeURIComponent(token)}`
  : `${VITE_ORIGIN}/support?t=${encodeURIComponent(token)}`
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForSelector('#helpdesk-problematica', { timeout: 60000 })
await page.waitForFunction(() => !document.body.innerText.includes('Cargando horarios'), null, {
  timeout: 120_000,
})
await page.fill('#helpdesk-problematica', 'Prueba reproducción slot click')
await page.getByRole('button', { name: 'Media' }).click()
await page.getByRole('button', { name: 'Semana siguiente' }).click()
await page.waitForFunction(() => !document.body.innerText.includes('Cargando horarios'), null, {
  timeout: 120_000,
})
const slotBtn = page.locator('button').filter({ hasText: /^Libre$/ }).first()
const slotCount = await page.locator('button').filter({ hasText: /^Libre$/ }).count()
if (slotCount === 0) {
  console.log('NO_LIBRE_SLOTS', await page.locator('#root').innerText())
  process.exit(2)
}
const beforeHtml = await page.locator('#root').innerHTML()
await slotBtn.click()
await page.waitForTimeout(800)
const afterHtml = await page.locator('#root').innerHTML()
const rootEmpty = (await page.locator('#root').innerText()).trim().length < 5

mkdirSync(resolve(SCRIPTS_DIR, 'output'), { recursive: true })
await page.screenshot({ path: resolve(SCRIPTS_DIR, 'output', 'support-after-slot-click.png'), fullPage: true })

console.log(JSON.stringify({ rootEmpty, beforeLen: beforeHtml.length, afterLen: afterHtml.length, logs }, null, 2))

vite?.kill()
apiServer?.close()
await browser.close()
process.exit(logs.pageerror.length || rootEmpty ? 1 : 0)
