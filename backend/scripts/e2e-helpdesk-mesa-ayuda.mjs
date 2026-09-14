/**
 * E2E panel /sistemas/mesa-ayuda (equipo vs sin acceso).
 *
 *   npm --prefix backend run build
 *   node backend/scripts/e2e-helpdesk-mesa-ayuda.mjs
 */

import { spawn } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getTestIdToken, initAdmin, getAdminDb, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(SCRIPT_DIR, 'output')
const SCREENSHOT_PANEL = resolve(OUTPUT_DIR, 'mesa-ayuda-panel.png')

const VITE_PORT = Number(process.env.E2E_VITE_PORT ?? 5176)
const API_PORT = Number(process.env.HELPDESK_TEST_PORT ?? 8796)
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`

const E2E_NOTA = `Nota E2E mesa-ayuda ${Date.now()}`
const E2E_AREA = 'E2E Mesa Ayuda Panel'

const results = []
let ticketId = null
let ticketRef = null
function record(label, ok, detail = '') {
  results.push({ label, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
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
    await new Promise((r) => setTimeout(r, 600))
  }
  throw new Error(`Timeout esperando ${url}`)
}

async function ensureBackendListening() {
  const { app } = await import('../lib/server.js')
  const server = await new Promise((resolvePromise, reject) => {
    const s = app.listen(API_PORT, '127.0.0.1', (err) => (err ? reject(err) : resolvePromise(s)))
  })
  await waitForHttpOk(`${API_ORIGIN}/api/health`, 30_000)
  console.log(`API local E2E en ${API_ORIGIN}`)
  return server
}

async function ensureViteDev() {
  const child = spawn(
    'npx',
    ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
    {
      cwd: ROOT,
      env: { ...process.env, VITE_API_BASE_URL: API_ORIGIN },
      stdio: 'ignore',
      shell: true,
    },
  )
  await waitForHttpOk(VITE_ORIGIN, 120_000)
  console.log(`Vite E2E en ${VITE_ORIGIN}`)
  return child
}

async function seedTicket(assigneeId) {
  initAdmin()
  const db = getAdminDb()
  const { uid, email } = await getTestIdToken()

  ticketRef = db.collection('helpdeskTickets').doc()
  ticketId = ticketRef.id
  await ticketRef.set({
    token: 'e2e-mesa-panel',
    requesterUid: uid,
    requesterEmail: email,
    requesterNombre: 'E2E Panel',
    areaId: 'e2e-area',
    areaNombre: E2E_AREA,
    problematica: 'Ticket prueba panel mesa de ayuda',
    urgencia: 'media',
    estadoIdx: 1,
    asignadoATeamId: assigneeId,
    createdAt: FieldValue.serverTimestamp(),
  })
}

async function cleanup() {
  if (!ticketId) return
  initAdmin()
  const db = getAdminDb()
  for (const sub of ['reuniones', 'notas']) {
    const snap = await db.collection('helpdeskTickets').doc(ticketId).collection(sub).get()
    for (const doc of snap.docs) {
      await doc.ref.delete()
    }
  }
  await db.collection('helpdeskTickets').doc(ticketId).delete().catch(() => {})
}

async function signInWithCustomToken(page, uid) {
  const customToken = await getAuth().createCustomToken(uid)
  await page.goto(`${VITE_ORIGIN}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => typeof window.__e2eSignInWithCustomToken === 'function',
    { timeout: 30_000 },
  )
  await page.evaluate(async (token) => {
    await window.__e2eSignInWithCustomToken(token)
  }, customToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })
}

async function runTeamMemberFlow(assigneeId) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  mkdirSync(OUTPUT_DIR, { recursive: true })

  try {
    const { uid } = await getTestIdToken()
    await signInWithCustomToken(page, uid)

    await page.goto(`${VITE_ORIGIN}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 60_000 })
    record('Usuario del equipo ve el panel', true)

    await page.getByTestId('helpdesk-mesa-ticket-row').filter({ hasText: E2E_AREA }).first().click()
    await page.getByTestId('helpdesk-mesa-detail').waitFor({ timeout: 30_000 })

    const estadoSelect = page.locator('select').filter({ hasText: 'Reunión inicial agendada' }).first()
    await estadoSelect.selectOption({ label: 'Realizando análisis' })
    await page.waitForTimeout(800)
    const detailText = await page.getByTestId('helpdesk-mesa-detail').innerText()
    record(
      'Cambio de estado reflejado en detalle',
      detailText.includes('Realizando análisis'),
    )

    await page.getByTestId('helpdesk-mesa-nota-input').fill(E2E_NOTA)
    await page.getByRole('button', { name: 'Guardar nota' }).click()
    await page.getByText(E2E_NOTA).waitFor({ timeout: 30_000 })
    record('Nota agregada visible en detalle', true)

    const layoutCheck = await page.evaluate(() => {
      function overlaps(a, b) {
        return !(a.bottom <= b.top || a.top >= b.bottom)
      }
      const mesaH1 = document.querySelector('[data-testid="helpdesk-mesa-panel"] h1')
      const ticketH2 = document.querySelector('[data-testid="helpdesk-mesa-detail"] h2')
      if (!mesaH1 || !ticketH2) return { ok: false, reason: 'missing headings' }
      const checks = []
      for (const y of [0, 200, 400, 600, 900]) {
        window.scrollTo(0, y)
        const a = mesaH1.getBoundingClientRect()
        const b = ticketH2.getBoundingClientRect()
        checks.push({ y, overlap: overlaps(a, b), mesaTop: a.top, ticketTop: b.top })
      }
      const pageScrollable = document.documentElement.scrollHeight > window.innerHeight + 24
      const scrollBefore = window.scrollY
      window.scrollTo(0, scrollBefore + 400)
      const pageScrollDelta = window.scrollY - scrollBefore
      const detailPane = document.querySelector('[data-testid="helpdesk-mesa-detail-scroll"]')
      let detailScrollable = false
      let detailScrollDelta = 0
      let detailOverflowY = ''
      let detailDimensions = null
      if (detailPane instanceof HTMLElement) {
        detailScrollable = detailPane.scrollHeight > detailPane.clientHeight + 8
        detailOverflowY = getComputedStyle(detailPane).overflowY
        detailDimensions = {
          scrollHeight: detailPane.scrollHeight,
          clientHeight: detailPane.clientHeight,
        }
        const before = detailPane.scrollTop
        detailPane.scrollTop = before > 0 ? Math.max(0, before - 240) : 240
        detailScrollDelta = Math.abs(detailPane.scrollTop - before)
      }
      return {
        ok: !checks.some((c) => c.overlap),
        checks,
        pageScrollable,
        pageScrollDelta,
        detailScrollable,
        detailScrollDelta,
        detailOverflowY,
        detailDimensions,
      }
    })
    record(
      'Encabezados Mesa de ayuda y Ticket no se superponen',
      layoutCheck.ok,
      layoutCheck.ok ? undefined : JSON.stringify(layoutCheck.checks?.filter((c) => c.overlap)),
    )
    const scrollOk =
      (layoutCheck.pageScrollable && layoutCheck.pageScrollDelta > 20) ||
      (layoutCheck.detailScrollable && layoutCheck.detailScrollDelta > 20) ||
      (!layoutCheck.pageScrollable && !layoutCheck.detailScrollable)
    record(
      'Scroll (página o panel detalle) responde',
      scrollOk,
      `pageΔ=${layoutCheck.pageScrollDelta} detailΔ=${layoutCheck.detailScrollDelta} overflow=${layoutCheck.detailOverflowY} dims=${JSON.stringify(layoutCheck.detailDimensions)}`,
    )

    await page.evaluate(() => window.scrollTo(0, 320))
    await page.waitForTimeout(300)
    const ticketHeaderVisible = await page.evaluate(() => {
      const h2 = document.querySelector('[data-testid="helpdesk-mesa-detail"] h2')
      if (!h2) return false
      const r = h2.getBoundingClientRect()
      const nav = document.querySelector('header.sticky')
      const navBottom = nav?.getBoundingClientRect().bottom ?? 0
      return r.top >= navBottom - 2 && r.bottom <= window.innerHeight && r.height > 0
    })
    record('Encabezado Ticket visible bajo navbar', ticketHeaderVisible)
    await page.screenshot({ path: SCREENSHOT_PANEL, fullPage: false })
    record('Screenshot panel guardado', existsSync(SCREENSHOT_PANEL), SCREENSHOT_PANEL)
  } finally {
    await browser.close()
  }
}

async function idTokenForUid(uid) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY?.trim()
  const customToken = await getAuth().createCustomToken(uid)
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  )
  const payload = await res.json()
  if (!res.ok || !payload.idToken) {
    throw new Error(payload.error?.message ?? 'No se pudo obtener idToken')
  }
  return payload.idToken
}

async function resolveOutsiderUid(db, teamEmails) {
  const usersSnap = await db.collection('users').limit(80).get()
  for (const doc of usersSnap.docs) {
    const email = typeof doc.get('email') === 'string' ? doc.get('email').trim().toLowerCase() : ''
    if (!email || teamEmails.has(email)) continue
    if (doc.get('role') === 'super_admin') continue
    if (doc.get('accountType') === 'external') continue
    const status = doc.get('status')
    if (status && status !== 'active') continue
    try {
      await getAuth().getUser(doc.id)
      return doc.id
    } catch {
      /* sin Auth */
    }
  }
  throw new Error('No se encontró usuario corporativo fuera de helpdeskTeam')
}

async function runForbiddenFlow(teamEmails) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    initAdmin()
    const db = getAdminDb()
    const outsiderUid = await resolveOutsiderUid(db, teamEmails)
    const outsiderToken = await idTokenForUid(outsiderUid)
    const apiTeam = await fetch(`${API_ORIGIN}/api/helpdesk/team`, {
      headers: { Authorization: `Bearer ${outsiderToken}`, Accept: 'application/json' },
    })
    record('API /team devuelve 403 para outsider', apiTeam.status === 403, `status ${apiTeam.status}`)

    await signInWithCustomToken(page, outsiderUid)
    await page.goto(`${VITE_ORIGIN}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
    const forbiddenVisible = await page
      .getByTestId('helpdesk-mesa-forbidden')
      .waitFor({ timeout: 45_000 })
      .then(() => true)
      .catch(() => false)
    const panelVisible = await page.getByTestId('helpdesk-mesa-panel').isVisible().catch(() => false)
    if (!forbiddenVisible) {
      await page
        .screenshot({ path: resolve(OUTPUT_DIR, 'mesa-ayuda-forbidden-fail.png'), fullPage: true })
        .catch(() => {})
    }
    record('Usuario fuera del equipo ve pantalla sin acceso', forbiddenVisible && !panelVisible)
  } finally {
    await browser.close()
  }
}

async function main() {
  loadTestEnv()

  initAdmin()
  const db = getAdminDb()
  const teamSnap = await db.collection('helpdeskTeam').where('activo', '==', true).get()
  if (teamSnap.empty) throw new Error('helpdeskTeam vacío')
  const assigneeId = teamSnap.docs[0].id
  const teamEmails = new Set(
    teamSnap.docs.map((d) =>
      typeof d.get('email') === 'string' ? d.get('email').trim().toLowerCase() : '',
    ),
  )

  let backendServer = null
  let viteProcess = null

  try {
    backendServer = await ensureBackendListening()
    viteProcess = await ensureViteDev()
    await seedTicket(assigneeId)
    await runTeamMemberFlow(assigneeId)
    try {
      await runForbiddenFlow(teamEmails)
    } catch (err) {
      record(
        'Usuario fuera del equipo ve pantalla sin acceso',
        false,
        err instanceof Error ? err.message : String(err),
      )
    }
  } catch (err) {
    record('Ejecución E2E (equipo)', false, err instanceof Error ? err.message : String(err))
  } finally {
    await cleanup()
    record('Limpieza ticket E2E', true)
    if (viteProcess && !viteProcess.killed) viteProcess.kill('SIGTERM')
    if (backendServer) await new Promise((r) => backendServer.close(r))
  }

  console.log('\n=== Resumen E2E mesa de ayuda ===')
  for (const row of results) {
    console.log(`${row.ok ? '✅' : '❌'} ${row.label}${row.detail ? ` — ${row.detail}` : ''}`)
  }
  if (existsSync(SCREENSHOT_PANEL)) {
    console.log(`\nScreenshot: ${SCREENSHOT_PANEL}`)
  }
  process.exit(results.some((r) => !r.ok) ? 1 : 0)
}

main()
