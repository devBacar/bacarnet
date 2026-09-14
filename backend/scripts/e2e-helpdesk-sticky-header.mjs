/**
 * Reproduce el scroll interno del detalle y captura el encabezado sticky.
 * Uso: node backend/scripts/e2e-helpdesk-sticky-header.mjs before
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const label = process.argv[2]?.trim() || 'capture'
const output = resolve(dirname(fileURLToPath(import.meta.url)), `output/sticky-header-${label}.png`)
const VITE_PORT = 5181
const API_PORT = 8797
const VITE = `http://127.0.0.1:${VITE_PORT}`
const API = `http://127.0.0.1:${API_PORT}`

async function waitOk(url) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // retry
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
  throw new Error(`timeout ${url}`)
}

loadTestEnv()
initAdmin()
const db = getAdminDb()
const auth = getAuth()
const teamSnapshot = await db.collection('helpdeskTeam').where('activo', '==', true).get()
let teamUser = null
let assigneeId = ''
for (const memberDoc of teamSnapshot.docs) {
  try {
    teamUser = await auth.getUserByEmail(String(memberDoc.get('email')))
    assigneeId = memberDoc.id
    break
  } catch {
    // Miembro sin cuenta activa.
  }
}
if (!teamUser?.email) throw new Error('No hay miembro del equipo con cuenta activa')
const ticketRef = db.collection('helpdeskTickets').doc()
await ticketRef.set({
  token: `sticky-${Date.now()}`,
  requesterUid: teamUser.uid,
  requesterEmail: teamUser.email,
  requesterNombre: 'Sticky Header Probe',
  areaId: 'sticky-probe',
  areaNombre: 'E2E Sticky Header',
  problematica: 'Encabezado de prueba para verificar que ningún texto se transparente.',
  urgencia: 'media',
  estadoIdx: 3,
  asignadoATeamId: assigneeId,
  createdAt: Timestamp.now(),
})
const batch = db.batch()
for (let index = 0; index < 24; index++) {
  const note = ticketRef.collection('notas').doc()
  batch.set(note, {
    autorNombre: 'Prueba automática',
    texto: `Texto de contenido desplazado ${index + 1}: Proyecto recibido · Reunión inicial agendada · En proceso.`,
    createdAt: Timestamp.fromMillis(Date.now() + index),
  })
}
await batch.commit()

const envDevLocal = resolve(ROOT, '.env.development.local')
const wroteEnv = !existsSync(envDevLocal)
if (wroteEnv) writeFileSync(envDevLocal, `VITE_API_BASE_URL=${API}\n`, 'utf8')

const { app } = await import('../lib/server.js')
const server = await new Promise((resolvePromise, reject) => {
  const instance = app.listen(API_PORT, '127.0.0.1', (error) =>
    error ? reject(error) : resolvePromise(instance),
  )
})
const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'], {
  cwd: ROOT,
  env: { ...process.env, VITE_API_BASE_URL: API },
  shell: true,
  stdio: 'ignore',
})
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
page.on('response', (response) => {
  if (response.url().includes('/api/helpdesk')) {
    console.log(`helpdesk response → ${response.status()} ${response.url()}`)
  }
})
page.on('console', (message) => console.log(`browser console: ${message.type()} ${message.text()}`))
page.on('requestfailed', (request) => console.log(`request failed: ${request.url()} ${request.failure()?.errorText}`))

try {
  await waitOk(`${API}/api/health`)
  await waitOk(VITE)
  const customToken = await auth.createCustomToken(teamUser.uid)
  await page.goto(VITE, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function')
  await page.evaluate((token) => window.__e2eSignInWithCustomToken(token), customToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 30_000 })
  await page.goto(`${VITE}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
  try {
    await page.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 15_000 })
  } catch (error) {
    console.log(JSON.stringify({ url: page.url(), body: (await page.locator('body').innerText()).slice(0, 1000) }))
    throw error
  }
  await page.getByText('E2E Sticky Header', { exact: true }).first().click()
  const detail = page.getByTestId('helpdesk-mesa-detail-scroll')
  await page.getByTestId('helpdesk-mesa-detail').waitFor()
  await detail.evaluate((element) => {
    element.scrollTop = 620
  })
  await page.waitForTimeout(300)
  const diagnostics = await detail.evaluate((element) => {
    const header = element.querySelector('[data-testid="helpdesk-ticket-sticky-header"]')
    if (!(header instanceof HTMLElement)) return null
    const style = getComputedStyle(header)
    const rect = header.getBoundingClientRect()
    const point = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return {
      scrollTop: element.scrollTop,
      backgroundColor: style.backgroundColor,
      opacity: style.opacity,
      zIndex: style.zIndex,
      elementAtCenter: point?.textContent?.slice(0, 120) ?? null,
    }
  })
  mkdirSync(dirname(output), { recursive: true })
  await page.screenshot({ path: output })
  console.log(JSON.stringify({ output, diagnostics }, null, 2))
} finally {
  await browser.close()
  vite.kill('SIGTERM')
  await new Promise((resolvePromise) => server.close(resolvePromise))
  await db.recursiveDelete(ticketRef)
  if (wroteEnv && existsSync(envDevLocal)) unlinkSync(envDevLocal)
}
