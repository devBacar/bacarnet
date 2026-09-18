/**
 * Smoke E2E real: bacarnet.web.app → Cloud Function api → ST producción.
 * Crea un usuario y ticket temporales, comenta desde UI, verifica ST y limpia MySQL/Firestore/Auth.
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { generateEphemeralPassword } from './lib/testSecrets.mjs'
import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

const PROD_APP = 'https://bacarnet.web.app'
const OUTPUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const SCREENSHOT = resolve(OUTPUT_DIR, 'soporte-ti-produccion-real.png')
const SCREENSHOT_BEFORE_FORM = resolve(OUTPUT_DIR, 'soporte-ti-antes-formulario.png')
const SCREENSHOT_BEFORE_LIST = resolve(OUTPUT_DIR, 'soporte-ti-antes-lista.png')
const runId = Date.now()
const email = `e2e.st.prod.${runId}@bacarsa.com.ar`
const password = generateEphemeralPassword()
const title = `E2E PROD Soporte TI ${runId}`
const comment = `Comentario real E2E ${runId}`

let firebaseUid = null
let stTicketId = null
let stUserId = null
let pool = null

loadTestEnv()
initAdmin()

const requireFromSt = createRequire(resolve('C:\\sistema-de-tickets\\backend\\package.json'))
requireFromSt('dotenv').config({ path: 'C:\\sistema-de-tickets\\backend\\.env' })
pool = requireFromSt('./src/config/db')

async function cleanup() {
  if (stTicketId) {
    for (const table of ['comments', 'ticket_attachments', 'ticket_assignees', 'ticket_feedback']) {
      await pool.execute(`DELETE FROM ${table} WHERE ticket_id = ?`, [stTicketId]).catch(() => {})
    }
    await pool.execute(
      "DELETE FROM notifications WHERE related_type = 'ticket' AND related_id = ?",
      [String(stTicketId)],
    ).catch(() => {})
    await pool.execute('DELETE FROM tickets WHERE id = ?', [stTicketId]).catch(() => {})
    await getAdminDb().collection('stTicketLinks').doc(String(stTicketId)).delete().catch(() => {})
  }
  if (!stUserId) {
    const [users] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]).catch(() => [[]])
    stUserId = users[0]?.id ?? null
  }
  if (stUserId) {
    await pool.execute('DELETE FROM notifications WHERE user_id = ?', [stUserId]).catch(() => {})
    await pool.execute('DELETE FROM users WHERE id = ? AND email = ?', [stUserId, email]).catch(() => {})
  }
  if (firebaseUid) {
    await getAdminDb().collection('users').doc(firebaseUid).delete().catch(() => {})
    await getAuth().deleteUser(firebaseUid).catch(() => {})
  }
}

try {
  const user = await getAuth().createUser({
    email,
    password,
    displayName: 'E2E ST Producción',
    emailVerified: true,
  })
  firebaseUid = user.uid
  await getAdminDb().collection('users').doc(user.uid).set({
    email,
    displayName: 'E2E ST Producción',
    role: 'user',
    department: 'General',
    accountType: 'corporate',
    accountStatus: 'active',
    managedAreaIds: [],
    permissions: {},
    createdAt: FieldValue.serverTimestamp(),
  })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } })
  try {
    await page.goto(PROD_APP, { waitUntil: 'domcontentloaded' })
    await page.locator('#login-email').fill(email)
    await page.locator('#login-password').fill(password)
    await page
      .locator('form')
      .filter({ has: page.locator('#login-email') })
      .getByRole('button', { name: /^iniciar sesión$/i })
      .click()
    await page.getByText(/Sesión activa|¡Hola,/i).first().waitFor({ timeout: 90_000 })

    await page.goto(`${PROD_APP}/soporte-ti`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Tickets', exact: true }).waitFor({ timeout: 90_000 })
    await page.getByRole('button', { name: 'Nuevo pedido' }).click()
    const form = page.getByTestId('st-ticket-create-form')
    mkdirSync(OUTPUT_DIR, { recursive: true })
    await page.screenshot({ path: SCREENSHOT_BEFORE_FORM, fullPage: true })
    await form.getByLabel('Área destinataria').selectOption({ index: 1 })
    await form.getByLabel('Categoría').selectOption({ index: 1 })
    await form.getByLabel('Título').fill(title)
    await form.getByLabel('Descripción').fill('Prueba real de integración BacarNet con ST producción.')

    const createResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/st-tickets/solicitudes') && res.request().method() === 'POST',
      { timeout: 120_000 },
    )
    await form.getByRole('button', { name: 'Enviar pedido' }).click()
    const createResponse = await createResponsePromise
    const created = await createResponse.json()
    if (createResponse.status() !== 201 || !Number.isInteger(created.stTicketId)) {
      throw new Error(`Creación falló: ${createResponse.status()} ${JSON.stringify(created)}`)
    }
    stTicketId = created.stTicketId

    const row = page.getByTestId(`st-ticket-${stTicketId}`)
    await row.waitFor({ timeout: 60_000 })
    await page.screenshot({ path: SCREENSHOT_BEFORE_LIST, fullPage: true })
    await row.click()
    const detail = page.getByTestId('st-ticket-detail')
    await detail.waitFor({ timeout: 60_000 })
    await detail.getByLabel('Nuevo comentario').fill(comment)
    const commentResponsePromise = page.waitForResponse(
      (res) => res.url().includes(`/${stTicketId}/comentarios`) && res.request().method() === 'POST',
      { timeout: 90_000 },
    )
    await detail.getByRole('button', { name: 'Enviar comentario' }).click()
    const commentResponse = await commentResponsePromise
    if (commentResponse.status() !== 201) throw new Error(`Comentario falló: ${commentResponse.status()}`)
    await detail.getByText(comment).waitFor({ timeout: 30_000 })

    const stBaseUrl = process.env.ST_BASE_URL || 'https://bacarsa.dyndns.org'
    const stResponse = await fetch(`${stBaseUrl}/api/integrations/bacarnet/tickets/${stTicketId}`, {
      headers: { 'X-Api-Key': process.env.ST_INTEGRATION_API_KEY },
    })
    const stBody = await stResponse.json()
    if (!stResponse.ok || stBody.data?.title !== title) {
      throw new Error(`ST no confirmó el ticket: ${stResponse.status} ${JSON.stringify(stBody)}`)
    }

    const [[ticketRow]] = await pool.execute('SELECT user_id, status FROM tickets WHERE id = ?', [stTicketId])
    if (!ticketRow || ticketRow.status !== 'open') throw new Error('El ticket no quedó abierto en MySQL ST')
    stUserId = ticketRow.user_id

    mkdirSync(OUTPUT_DIR, { recursive: true })
    await page.screenshot({ path: SCREENSHOT, fullPage: true })
    console.log('PASS producción: ticket creado en ST', stTicketId)
    console.log('PASS producción: comentario visible', comment)
    console.log('PASS producción: ticket confirmado por API M2M y MySQL')
    console.log(SCREENSHOT)
  } finally {
    await browser.close()
  }
} finally {
  await cleanup()
  const [tickets] = await pool.execute('SELECT COUNT(*) AS total FROM tickets WHERE title = ?', [title])
  const [users] = await pool.execute('SELECT COUNT(*) AS total FROM users WHERE email = ?', [email])
  const link = stTicketId
    ? await getAdminDb().collection('stTicketLinks').doc(String(stTicketId)).get()
    : null
  console.log('Limpieza:', {
    tickets: Number(tickets[0].total),
    users: Number(users[0].total),
    firestoreLink: link?.exists ?? false,
  })
  await pool.end()
}
