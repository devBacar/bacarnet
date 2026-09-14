/**
 * Agrega una minuta desde el panel interno y confirma su lectura en Mis proyectos.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/e2e-helpdesk-minuta.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const VITE_PORT = 5176
const API_PORT = 8796
const VITE = `http://127.0.0.1:${VITE_PORT}`
const API = `http://127.0.0.1:${API_PORT}`

async function waitOk(url) {
  for (let i = 0; i < 120; i++) {
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
const teamUser = await auth.getUserByEmail('admin@bacarsa.com.ar')
const teamSnapshot = await db.collection('helpdeskTeam').where('activo', '==', true).get()
const teamEmails = new Set(
  teamSnapshot.docs.map((doc) => String(doc.get('email') ?? '').trim().toLowerCase()),
)
const usersSnapshot = await db.collection('users').limit(100).get()
let requester = null
for (const userDoc of usersSnapshot.docs) {
  const email = String(userDoc.get('email') ?? '').trim().toLowerCase()
  if (!email || teamEmails.has(email)) continue
  if (userDoc.get('accountType') === 'external' || userDoc.get('active') === false) continue
  try {
    requester = await auth.getUserByEmail(email)
    break
  } catch {
    // Usuario de Firestore sin cuenta activa en Firebase Auth.
  }
}
if (!requester?.email) throw new Error('No se encontró un usuario solicitante para el E2E')
console.log(`Solicitante E2E: ${requester.email}`)
const suffix = Date.now()
const areaNombre = `E2E Minuta ${suffix}`
const minutaTexto = `Minuta automática ${suffix}`
const ticketRef = db.collection('helpdeskTickets').doc()
const reunionRef = ticketRef.collection('reuniones').doc()

await ticketRef.set({
  token: `e2e-minuta-${suffix}`,
  requesterUid: requester.uid,
  requesterEmail: requester.email,
  requesterNombre: requester.displayName || 'Eduardo Asinardi',
  areaId: `e2e-${suffix}`,
  areaNombre,
  problematica: 'Verificación automática de minuta',
  urgencia: 'baja',
  estadoIdx: 1,
  asignadoATeamId: null,
  createdAt: Timestamp.now(),
})
await reunionRef.set({
  tipo: 'Reunión E2E',
  fecha: '18/09/2026',
  hora: '10:00',
  conTeamId: 'e2e',
  participantesTeamIds: [],
  estado: 'confirmada',
  createdAt: Timestamp.now(),
})

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
  {
    cwd: ROOT,
    env: { ...process.env, VITE_API_BASE_URL: API },
    stdio: 'ignore',
    shell: true,
  },
)
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

try {
  await waitOk(`${API}/api/health`)
  await waitOk(VITE)

  const teamToken = await auth.createCustomToken(teamUser.uid)
  await page.goto(VITE, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function')
  await page.evaluate((token) => window.__e2eSignInWithCustomToken(token), teamToken)
  await page.goto(`${VITE}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 60_000 })
  await page.getByText(areaNombre, { exact: true }).click()
  await page.getByTestId('helpdesk-mesa-detail').waitFor({ timeout: 30_000 })
  await page.getByText('Agregar minuta', { exact: true }).click()
  await page.getByTestId('helpdesk-reunion-minuta-input').fill(minutaTexto)
  await page.getByTestId('helpdesk-reunion-minuta-save').click()
  await page.getByText('Minuta guardada', { exact: true }).waitFor({ timeout: 30_000 })
  const internalValue = await page.getByTestId('helpdesk-reunion-minuta-input').inputValue()
  if (internalValue !== minutaTexto) throw new Error('la minuta no quedó visible en el panel')

  const requesterToken = await auth.createCustomToken(requester.uid)
  await page.evaluate((token) => window.__e2eSignInWithCustomToken(token), requesterToken)
  await page.goto(VITE, { waitUntil: 'domcontentloaded' })
  await page.getByText('Sesión activa').waitFor({ timeout: 30_000 })
  await page.goto(`${VITE}/mis-solicitudes-sistemas`, { waitUntil: 'domcontentloaded' })
  const card = page.locator(`[data-ticket-id="${ticketRef.id}"]`)
  await card.waitFor({ timeout: 60_000 })
  await card.getByTestId('helpdesk-mis-proyectos-minuta').getByText(minutaTexto).waitFor()

  console.log(JSON.stringify({ ticketId: ticketRef.id, reunionId: reunionRef.id }))
  console.log('PASS: minuta editable y visible en Mis proyectos')
} finally {
  await browser.close()
  vite.kill('SIGTERM')
  await new Promise((resolvePromise) => server.close(resolvePromise))
  await db.recursiveDelete(ticketRef)
  if (wroteEnv && existsSync(envDevLocal)) unlinkSync(envDevLocal)
}
