/**
 * Detecta superposición Mesa de ayuda vs Ticket header y prueba scroll.
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getTestIdToken, initAdmin, getAdminDb, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output/mesa-ayuda-layout-fixed.png')
const VITE_PORT = 5177
const API_PORT = 8795
const VITE = `http://127.0.0.1:${VITE_PORT}`
const API = `http://127.0.0.1:${API_PORT}`
const E2E_AREA = 'E2E Layout Probe'

async function waitOk(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('timeout')
}

loadTestEnv()
initAdmin()

const { app } = await import('../lib/server.js')
const server = await new Promise((res, rej) => {
  const s = app.listen(API_PORT, '127.0.0.1', (e) => (e ? rej(e) : res(s)))
})
await waitOk(`${API}/api/health`)

const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'], {
  cwd: ROOT,
  env: { ...process.env, VITE_API_BASE_URL: API },
  shell: true,
  stdio: 'ignore',
})
await waitOk(VITE)

const db = getAdminDb()
const { uid, email } = await getTestIdToken()
const teamSnap = await db.collection('helpdeskTeam').limit(1).get()
const assigneeId = teamSnap.docs[0]?.id ?? ''
const ticketRef = db.collection('helpdeskTickets').doc()
let browser
try {
await ticketRef.set({
  token: 'layout-probe',
  requesterUid: uid,
  requesterEmail: email,
  requesterNombre: 'Layout Probe',
  areaId: 'e2e',
  areaNombre: E2E_AREA,
  problematica: 'Texto largo para forzar scroll en el panel de detalle del ticket.',
  urgencia: 'alta',
  estadoIdx: 2,
  asignadoATeamId: assigneeId,
  createdAt: FieldValue.serverTimestamp(),
})

browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
const customToken = await getAuth().createCustomToken(uid)
await page.goto(`${VITE}/`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function')
await page.evaluate(async (t) => window.__e2eSignInWithCustomToken(t), customToken)
await page.getByText('Sesión activa').waitFor()
await page.goto(`${VITE}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
await page.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 60_000 })
const row = page.getByTestId('helpdesk-mesa-ticket-row').filter({ hasText: E2E_AREA }).first()
await row.waitFor({ timeout: 60_000 })
await row.click()
await page.getByTestId('helpdesk-mesa-detail').waitFor()

function overlap(a, b) {
  return !(a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right)
}

const report = await page.evaluate(() => {
  const mesa = document.querySelector('[data-testid="helpdesk-mesa-panel"] h1')
  const ticket = document.querySelector('[data-testid="helpdesk-mesa-detail"] h2')
  const mesaBox = mesa?.getBoundingClientRect()
  const ticketBox = ticket?.getBoundingClientRect()
  const nav = document.querySelector('header.sticky, nav.sticky, [class*="sticky"]')
  return {
    mesa: mesaBox ? { top: mesaBox.top, bottom: mesaBox.bottom, text: mesa.textContent } : null,
    ticket: ticketBox ? { top: ticketBox.top, bottom: ticketBox.bottom, text: ticketBox.textContent } : null,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    navSticky: nav?.className ?? null,
  }
})

let overlapped = false
if (report.mesa && report.ticket) {
  overlapped = overlap(report.mesa, report.ticket)
}

for (const y of [0, 400, 800, 1200]) {
  await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y)
  await page.waitForTimeout(200)
  const o = await page.evaluate(() => {
    const mesa = document.querySelector('[data-testid="helpdesk-mesa-panel"] h1')
    const ticket = document.querySelector('[data-testid="helpdesk-mesa-detail"] h2')
    if (!mesa || !ticket) return false
    const a = mesa.getBoundingClientRect()
    const b = ticket.getBoundingClientRect()
    return !(a.bottom <= b.top || a.top >= b.bottom)
  })
  if (o) overlapped = true
}

const scrollWorks = await page.evaluate(async () => {
  const before = window.scrollY
  window.scrollTo(0, 2000)
  await new Promise((r) => requestAnimationFrame(r))
  return window.scrollY > before
})
await page.evaluate(() => window.scrollTo(0, 350))
await page.waitForTimeout(300)
mkdirSync(dirname(OUT), { recursive: true })
await page.screenshot({ path: OUT })

console.log(JSON.stringify({ report, overlapped, scrollWorks }, null, 2))

} finally {
  await ticketRef.delete().catch(() => {})
  if (browser) await browser.close().catch(() => {})
}
vite.kill()
await new Promise((r) => server.close(r))
process.exit(overlapped ? 1 : 0)
