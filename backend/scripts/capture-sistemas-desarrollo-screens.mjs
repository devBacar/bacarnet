/**
 * Screenshots de las 3 pantallas del módulo tras el rename visible a SISTEMAS · DESARROLLO.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/capture-sistemas-desarrollo-screens.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const VITE_PORT = 5175
const API_PORT = 8795
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

function assertNoOldCopy(text, screen) {
  const lowered = text.toLowerCase()
  if (lowered.includes('helpdesk') || lowered.includes('mesa de ayuda')) {
    throw new Error(`${screen}: quedó texto viejo en pantalla`)
  }
  if (lowered.includes('solicitudes') || /(^|\s)solicitud(es)?(\s|$)/i.test(text)) {
    throw new Error(`${screen}: quedó "solicitud(es)" visible`)
  }
}

loadTestEnv()
initAdmin()

const ENV_DEV_LOCAL = resolve(ROOT, '.env.development.local')
const wroteEnv = !existsSync(ENV_DEV_LOCAL)
if (wroteEnv) {
  writeFileSync(ENV_DEV_LOCAL, `VITE_API_BASE_URL=${API}\n`, 'utf8')
}

const { app } = await import('../lib/server.js')
const server = await new Promise((res, rej) => {
  const s = app.listen(API_PORT, '127.0.0.1', (e) => (e ? rej(e) : res(s)))
})
await waitOk(`${API}/api/health`)

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
await waitOk(VITE)

const { generarTokenSolicitud } = await import('../lib/modules/helpdesk/accessToken.js')
const token = generarTokenSolicitud({
  email: 'rename.support@bacarsa.com.ar',
  nombre: 'Rename Support',
  areaId: 'rename',
  areaNombre: 'Sistemas',
})

mkdirSync(OUT_DIR, { recursive: true })
const shots = {
  support: resolve(OUT_DIR, 'sistemas-desarrollo-01-support.png'),
  mis: resolve(OUT_DIR, 'sistemas-desarrollo-02-mis-solicitudes.png'),
  mesa: resolve(OUT_DIR, 'sistemas-desarrollo-03-mesa-ayuda.png'),
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

const helpdeskReqs = []
page.on('request', (req) => {
  if (req.url().includes('/api/helpdesk/')) helpdeskReqs.push(req.url())
})

try {
  await page.goto(`${VITE}/support?t=${encodeURIComponent(token)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  })
  await page.waitForFunction(() => !document.body.innerText.includes('Cargando horarios'), null, {
    timeout: 120_000,
  })
  await page.getByText('Sistemas · Desarrollo').first().waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Enviar proyecto' }).waitFor({ timeout: 15_000 })
  assertNoOldCopy(await page.locator('body').innerText(), '/support')
  await page.screenshot({ path: shots.support, fullPage: true })

  const { getAdminDb } = await import('./get-test-token.mjs')
  const db = getAdminDb()
  const teamSnap = await db.collection('helpdeskTeam').where('activo', '==', true).limit(8).get()
  const teamEmails = teamSnap.docs
    .map((d) => (typeof d.get('email') === 'string' ? d.get('email').trim().toLowerCase() : ''))
    .filter(Boolean)
  if (teamEmails.length === 0) throw new Error('helpdeskTeam vacío')

  let teamUid = null
  for (const email of teamEmails) {
    try {
      const record = await getAuth().getUserByEmail(email)
      teamUid = record.uid
      break
    } catch {
      const users = await db.collection('users').where('email', '==', email).limit(1).get()
      if (!users.empty) {
        teamUid = users.docs[0].id
        break
      }
    }
  }
  if (!teamUid) {
    const fallback = await getTestIdToken()
    teamUid = fallback.uid
  }

  const customToken = await getAuth().createCustomToken(teamUid)
  await page.goto(`${VITE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function')
  await page.evaluate(async (t) => window.__e2eSignInWithCustomToken(t), customToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })

  await page.goto(`${VITE}/mis-solicitudes-sistemas`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Sistemas · Desarrollo').first().waitFor({ timeout: 30_000 })
  await page.getByRole('heading', { name: 'Mis proyectos' }).waitFor()
  await page.waitForFunction(() => !document.body.innerText.includes('Cargando proyectos'), null, {
    timeout: 30_000,
  })
  assertNoOldCopy(await page.locator('body').innerText(), '/mis-solicitudes-sistemas')
  await page.screenshot({ path: shots.mis, fullPage: true })

  await page.goto(`${VITE}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
  const panel = page.getByTestId('helpdesk-mesa-panel')
  const forbidden = page.getByTestId('helpdesk-mesa-forbidden')
  await Promise.race([
    panel.waitFor({ timeout: 60_000 }),
    forbidden.waitFor({ timeout: 60_000 }),
  ])
  if (await forbidden.isVisible().catch(() => false)) {
    const hosts = [...new Set(helpdeskReqs.map((u) => new URL(u).origin))]
    const body = await page.locator('body').innerText()
    throw new Error(`panel 403. apiHosts=${hosts.join(',')} body: ${body.slice(0, 400)}`)
  }
  await page.getByText('Sistemas · Desarrollo').first().waitFor({ timeout: 15_000 })
  await page.getByRole('heading', { name: 'Proyectos' }).first().waitFor()
  await page.waitForFunction(() => !document.body.innerText.includes('Actualizando lista'), null, {
    timeout: 30_000,
  })
  assertNoOldCopy(await page.locator('body').innerText(), '/sistemas/mesa-ayuda')
  await page.screenshot({ path: shots.mesa, fullPage: true })

  console.log(JSON.stringify(shots, null, 2))
  console.log('PASS: las 3 pantallas muestran SISTEMAS · DESARROLLO')
} finally {
  await browser.close()
  vite.kill('SIGTERM')
  await new Promise((r) => server.close(r))
  if (wroteEnv && existsSync(ENV_DEV_LOCAL)) unlinkSync(ENV_DEV_LOCAL)
}
