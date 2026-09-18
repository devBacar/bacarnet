/**
 * E2E BacarNet → proxy Firebase → API M2M ST → MySQL.
 * Crea usuarios/ticket temporales, prueba ownership, comentario, adjunto,
 * reabrir/cerrar y elimina todos los registros/archivos al finalizar.
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ST_ROOT = 'C:\\sistema-de-tickets'
const ST_BACKEND = resolve(ST_ROOT, 'backend')
const OUTPUT_DIR = resolve(ROOT, 'backend/scripts/output')
const SCREENSHOT_DETAIL = resolve(OUTPUT_DIR, 'soporte-ti-detalle-comentarios-acciones.png')
const SCREENSHOT_CLOSED = resolve(OUTPUT_DIR, 'soporte-ti-ticket-cerrado.png')
const SCREENSHOT_AFTER_FORM = resolve(OUTPUT_DIR, 'soporte-ti-despues-formulario.png')
const SCREENSHOT_AFTER_LIST = resolve(OUTPUT_DIR, 'soporte-ti-despues-lista-colapsada.png')
const SCREENSHOT_AFTER_DETAIL = resolve(OUTPUT_DIR, 'soporte-ti-despues-detalle-expandido.png')
const ATTACHMENT_PATH = resolve(ROOT, 'public/logo-bacar.png')
const VITE_PORT = 5205
const API_PORT = 8797
const ST_PORT = 8897
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`
const ST_ORIGIN = `http://127.0.0.1:${ST_PORT}`
const runId = Date.now()
const ownerEmail = `e2e.st.owner.${runId}@bacarsa.com.ar`
const otherEmail = `e2e.st.other.${runId}@bacarsa.com.ar`
const title = `E2E Soporte TI ${runId}`
const comment = `Comentario E2E ${runId}`

const results = []
let ownerUid = null
let otherUid = null
let stTicketId = null
let stUserId = null
let stServer = null
let apiServer = null
let viteProcess = null
let pool = null
const uploadedPaths = []

function record(label, ok, detail = '') {
  results.push({ label, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) throw new Error(`${label}${detail ? `: ${detail}` : ''}`)
}

async function waitForHttp(url, timeoutMs = 90_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) })
      if (res.status < 500) return
    } catch {
      // retry
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
  throw new Error(`Timeout esperando ${url}`)
}

function loadStEnv() {
  const path = resolve(ST_BACKEND, '.env')
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

async function startStApi() {
  const requireFromSt = createRequire(resolve(ST_BACKEND, 'package.json'))
  const express = requireFromSt('express')
  pool = requireFromSt('./src/config/db')
  const app = express()
  const ioStub = { emit() {}, to() { return ioStub } }
  app.use(express.json())
  app.use((req, _res, next) => {
    req.io = ioStub
    next()
  })
  app.use('/api/integrations/bacarnet', requireFromSt('./src/routes/bacarnetIntegrationRoutes'))
  app.use((err, _req, res, _next) => {
    res.status(res.statusCode >= 400 ? res.statusCode : 500).json({ error: err.message, message: err.message })
  })
  stServer = await new Promise((resolvePromise) => {
    const server = app.listen(ST_PORT, '127.0.0.1', () => resolvePromise(server))
  })
  await waitForHttp(`${ST_ORIGIN}/api/integrations/bacarnet/catalogo`)
}

async function startBacarnetApi() {
  process.env.ST_BASE_URL = ST_ORIGIN
  const { app } = await import('../lib/server.js')
  apiServer = await new Promise((resolvePromise) => {
    const server = app.listen(API_PORT, '127.0.0.1', () => resolvePromise(server))
  })
  await waitForHttp(`${API_ORIGIN}/api/health`)
}

async function startVite() {
  execFileSync(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'build'], {
    cwd: ROOT,
    env: { ...process.env, VITE_API_BASE_URL: API_ORIGIN, VITE_E2E: 'true' },
    stdio: 'inherit',
  })
  viteProcess = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'], {
    cwd: ROOT,
    env: { ...process.env, VITE_API_BASE_URL: API_ORIGIN, VITE_E2E: 'true' },
    shell: false,
    stdio: 'inherit',
  })
  await waitForHttp(VITE_ORIGIN, 120_000)
}

async function createBacarnetUser(email, displayName) {
  const auth = getAuth()
  const record = await auth.createUser({ email, displayName, emailVerified: true })
  await getAdminDb().collection('users').doc(record.uid).set({
    email,
    displayName,
    role: 'user',
    department: 'General',
    accountType: 'corporate',
    accountStatus: 'active',
    managedAreaIds: [],
    permissions: {},
    createdAt: FieldValue.serverTimestamp(),
  })
  return record.uid
}

async function signIn(page, uid) {
  const customToken = await getAuth().createCustomToken(uid)
  await page.goto(`${VITE_ORIGIN}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function')
  await page.evaluate((token) => window.__e2eSignInWithCustomToken(token), customToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })
}

async function idToken(uid) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY
  const customToken = await getAuth().createCustomToken(uid)
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`No se pudo obtener ID token: ${JSON.stringify(body)}`)
  return body.idToken
}

async function runUi() {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1365, height: 1100 } })
  page.on('console', (message) => console.log('[browser]', message.type(), message.text()))
  page.on('pageerror', (err) => console.error('[browser error]', err.message))
  page.on('dialog', (dialog) => dialog.accept())
  try {
    await signIn(page, ownerUid)
    await page.goto(`${VITE_ORIGIN}/soporte-ti`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Tickets', exact: true }).waitFor({ timeout: 60_000 })
    await page.getByRole('button', { name: 'Nuevo pedido' }).click()
    const form = page.getByTestId('st-ticket-create-form')
    await form.waitFor()
    await page.screenshot({ path: SCREENSHOT_AFTER_FORM, fullPage: true })
    record('Captura formulario rediseñado', existsSync(SCREENSHOT_AFTER_FORM))
    await form.getByLabel('Área destinataria').selectOption({ label: 'SOPORTE - IT' })
    await form.getByLabel('Categoría').selectOption({ label: 'Cuentas y Accesos' })
    await form.getByLabel('Título').fill(title)
    await form.getByLabel('Descripción').fill('Pedido automático E2E con adjunto y comentarios.')
    await form.getByRole('radio', { name: /Alta/ }).click()
    await form.getByTestId('st-ticket-create-attachments').setInputFiles(ATTACHMENT_PATH)

    const createResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/st-tickets/solicitudes') && res.request().method() === 'POST',
      { timeout: 90_000 },
    )
    await form.getByRole('button', { name: 'Enviar pedido' }).click()
    const createResponse = await createResponsePromise
    const created = await createResponse.json()
    stTicketId = created.stTicketId
    record('Crear ticket con adjunto', createResponse.status() === 201 && Number.isInteger(stTicketId), `#${stTicketId}`)

    const row = page.getByTestId(`st-ticket-${stTicketId}`)
    await row.waitFor({ timeout: 30_000 })
    record('Ticket agrupado en Activos', await page.getByTestId('st-tickets-group-active').getByTestId(`st-ticket-${stTicketId}`).count() === 1)
    record('Fila empieza colapsada', await row.getAttribute('aria-expanded') === 'false')
    await page.screenshot({ path: SCREENSHOT_AFTER_LIST, fullPage: true })
    record('Captura lista agrupada y colapsada', existsSync(SCREENSHOT_AFTER_LIST))
    await row.click()
    const detail = page.getByTestId('st-ticket-detail')
    await detail.waitFor({ timeout: 30_000 })
    record('Adjunto inicial visible', (await detail.innerText()).includes('logo-bacar.png'))

    await detail.getByLabel('Nuevo comentario').fill(comment)
    const commentResponsePromise = page.waitForResponse(
      (res) => res.url().includes(`/${stTicketId}/comentarios`) && res.request().method() === 'POST',
    )
    await detail.getByRole('button', { name: 'Enviar comentario' }).click()
    record('POST comentario responde 201', (await commentResponsePromise).status() === 201)
    await detail.getByText(comment).waitFor()
    record('Comentario aparece cronológicamente', (await detail.getByTestId('st-comments-list').innerText()).includes(comment))
    await page.screenshot({ path: SCREENSHOT_AFTER_DETAIL, fullPage: true })
    record('Captura detalle expandido', existsSync(SCREENSHOT_AFTER_DETAIL))

    const [[ticketRow]] = await pool.execute('SELECT user_id FROM tickets WHERE id = ?', [stTicketId])
    stUserId = ticketRow.user_id
    const [attachmentRows] = await pool.execute('SELECT file_path FROM ticket_attachments WHERE ticket_id = ?', [stTicketId])
    uploadedPaths.push(...attachmentRows.map((row) => row.file_path))

    const otherToken = await idToken(otherUid)
    const deniedGet = await fetch(`${API_ORIGIN}/api/st-tickets/${stTicketId}`, {
      headers: { Authorization: `Bearer ${otherToken}` },
    })
    const deniedPost = await fetch(`${API_ORIGIN}/api/st-tickets/${stTicketId}/comentarios`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: 'No autorizado' }),
    })
    record('Otro uid no puede ver el ticket', deniedGet.status === 404, `status ${deniedGet.status}`)
    record('Otro uid no puede comentar', deniedPost.status === 404, `status ${deniedPost.status}`)

    await pool.execute("UPDATE tickets SET status = 'resolved' WHERE id = ?", [stTicketId])
    await getAdminDb().collection('stTicketLinks').doc(String(stTicketId)).update({ status: 'resolved' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    const resolvedRow = page.getByTestId(`st-ticket-${stTicketId}`)
    await resolvedRow.waitFor()
    record('Ticket resuelto agrupado en Resueltos', await page.getByTestId('st-tickets-group-resolved').getByTestId(`st-ticket-${stTicketId}`).count() === 1)
    await resolvedRow.click()
    const resolvedDetail = page.getByTestId('st-ticket-detail')
    await resolvedDetail.waitFor()
    await resolvedDetail.getByTestId('st-resolved-actions').waitFor()
    await page.screenshot({ path: SCREENSHOT_DETAIL, fullPage: true })
    record('Captura detalle con comentarios y acciones', existsSync(SCREENSHOT_DETAIL))

    const reopenResponse = page.waitForResponse(
      (res) => res.url().includes(`/${stTicketId}/estado`) && res.request().method() === 'PUT',
    )
    await resolvedDetail.getByRole('button', { name: 'Reabrir' }).click()
    record('Reabrir desde UI', (await reopenResponse).status() === 200)

    await pool.execute("UPDATE tickets SET status = 'resolved' WHERE id = ?", [stTicketId])
    await getAdminDb().collection('stTicketLinks').doc(String(stTicketId)).update({ status: 'resolved' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByTestId(`st-ticket-${stTicketId}`).click()
    const closeDetail = page.getByTestId('st-ticket-detail')
    await closeDetail.getByTestId('st-resolved-actions').waitFor()
    const closeResponse = page.waitForResponse(
      (res) => res.url().includes(`/${stTicketId}/estado`) && res.request().method() === 'PUT',
    )
    await closeDetail.getByRole('button', { name: 'Cerrar', exact: true }).click()
    record('Cerrar desde UI', (await closeResponse).status() === 200)
    await page.screenshot({ path: SCREENSHOT_CLOSED, fullPage: true })
    record('Acciones ocultas después de cerrar', await closeDetail.getByTestId('st-resolved-actions').count() === 0)
  } finally {
    await browser.close()
  }
}

async function cleanup() {
  const db = getAdminDb()
  if (!stTicketId && stUserId) {
    const [rows] = await pool.execute('SELECT id FROM tickets WHERE user_id = ? AND title = ?', [stUserId, title])
    stTicketId = rows[0]?.id ?? null
  }
  if (stTicketId && pool) {
    const [files] = await pool.execute('SELECT file_path FROM ticket_attachments WHERE ticket_id = ?', [stTicketId]).catch(() => [[]])
    uploadedPaths.push(...files.map((row) => row.file_path))
    for (const table of ['comments', 'ticket_attachments', 'ticket_assignees', 'ticket_feedback']) {
      await pool.execute(`DELETE FROM ${table} WHERE ticket_id = ?`, [stTicketId]).catch(() => {})
    }
    await pool.execute("DELETE FROM notifications WHERE related_type = 'ticket' AND related_id = ?", [String(stTicketId)]).catch(() => {})
    await pool.execute('DELETE FROM tickets WHERE id = ?', [stTicketId]).catch(() => {})
    await db.collection('stTicketLinks').doc(String(stTicketId)).delete().catch(() => {})
  }
  if (stUserId && pool) {
    await pool.execute('DELETE FROM notifications WHERE user_id = ?', [stUserId]).catch(() => {})
    await pool.execute('DELETE FROM users WHERE id = ? AND email = ?', [stUserId, ownerEmail]).catch(() => {})
  }
  for (const filePath of new Set(uploadedPaths)) {
    const absolute = resolve(ROOT, 'backend', String(filePath).replaceAll('\\', '/'))
    if (existsSync(absolute)) unlinkSync(absolute)
  }
  for (const uid of [ownerUid, otherUid]) {
    if (!uid) continue
    await db.collection('users').doc(uid).delete().catch(() => {})
    await getAuth().deleteUser(uid).catch(() => {})
  }
}

async function main() {
  loadTestEnv()
  loadStEnv()
  initAdmin()
  try {
    ownerUid = await createBacarnetUser(ownerEmail, 'E2E ST Owner')
    otherUid = await createBacarnetUser(otherEmail, 'E2E ST Other')
    await startStApi()
    await startBacarnetApi()
    await startVite()
    await runUi()
  } finally {
    await cleanup().catch((err) => console.error('Error de limpieza:', err))
    if (viteProcess) viteProcess.kill()
    if (apiServer) await new Promise((resolvePromise) => apiServer.close(resolvePromise))
    if (stServer) await new Promise((resolvePromise) => stServer.close(resolvePromise))
    if (pool) await pool.end().catch(() => {})
  }

  console.log(`\n${results.length} verificaciones OK`)
  console.log(SCREENSHOT_DETAIL)
  console.log(SCREENSHOT_CLOSED)
}

main().catch((err) => {
  console.error('\nE2E ST FALLÓ:', err)
  process.exitCode = 1
})
