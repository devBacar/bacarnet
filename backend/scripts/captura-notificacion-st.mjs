/**
 * Captura la notificación real de cambio de estado de ticket ST en la campanita,
 * contra el bacarnet.web.app de producción y con login real por email/contraseña.
 * Crea un usuario y tres stTicketLinks temporales, dispara el webhook de producción
 * para cada uno (En atención / Resuelto / Cerrado) y fotografía el panel. Limpia todo.
 *
 * Uso: node backend/scripts/captura-notificacion-st.mjs
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { generateEphemeralPassword } from './lib/testSecrets.mjs'
import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUTPUT_DIR = resolve(ROOT, 'backend/scripts/output')
const SHOT_PANEL = resolve(OUTPUT_DIR, 'notificacion-st-campanita.png')
const SHOT_ITEM = resolve(OUTPUT_DIR, 'notificacion-st-detalle.png')
const SHOT_DESTINO = resolve(OUTPUT_DIR, 'notificacion-st-deeplink-soporte-ti.png')

const API_ORIGIN = 'https://api-u4bp6pm7aa-rj.a.run.app'
const APP_ORIGIN = 'https://bacarnet.web.app'

const runId = Date.now()
const email = `e2e.st.notif.${runId}@bacarsa.com.ar`
const password = generateEphemeralPassword()
const tickets = [
  { id: 999_100_000 + (runId % 100_000), title: `No anda la impresora de Compras`, status: 'in-progress', previousStatus: 'open', source: 'agent' },
  { id: 999_200_000 + (runId % 100_000), title: `Alta de usuario en el ERP`, status: 'resolved', previousStatus: 'in-progress', source: 'agent' },
  { id: 999_300_000 + (runId % 100_000), title: `Migrar carpeta compartida de Ventas`, status: 'closed', previousStatus: 'resolved', source: 'cron' },
]

/** Sin webhook: solo para ver el badge «Recibido» en la lista de /soporte-ti. */
const openTicket = { id: 999_400_000 + (runId % 100_000), title: 'Teclado de recepción no responde' }

let uid = null
let db = null
let browser = null

async function postWebhook(apiKey, body) {
  const res = await fetch(`${API_ORIGIN}/api/st-tickets/webhooks/estado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify(body),
  })
  return { status: res.status, text: await res.text() }
}

async function main() {
  loadTestEnv()
  initAdmin()
  db = getAdminDb()
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const apiKey = process.env.ST_INTEGRATION_API_KEY?.trim()
  if (!apiKey) throw new Error('Falta ST_INTEGRATION_API_KEY en backend/.env.local')

  const record = await getAuth().createUser({ email, password, displayName: 'Ana Prueba', emailVerified: true })
  uid = record.uid
  await db.collection('users').doc(uid).set({
    email,
    displayName: 'Ana Prueba',
    role: 'user',
    department: 'General',
    accountType: 'corporate',
    accountStatus: 'active',
    managedAreaIds: [],
    permissions: {},
    createdAt: FieldValue.serverTimestamp(),
  })
  console.log(`Usuario temporal: ${email} (${uid})`)

  await db.collection('stTicketLinks').doc(String(openTicket.id)).set({
    stTicketId: openTicket.id,
    ownerUid: uid,
    requesterEmail: email,
    requesterNombre: 'Ana Prueba',
    title: openTicket.title,
    description: 'ticket temporal para la captura',
    priority: 'medium',
    status: 'open',
    attachments: [],
  })

  // Los webhooks se disparan en orden inverso para que el más reciente quede arriba.
  for (const ticket of [...tickets].reverse()) {
    await db.collection('stTicketLinks').doc(String(ticket.id)).set({
      stTicketId: ticket.id,
      ownerUid: uid,
      requesterEmail: email,
      requesterNombre: 'Ana Prueba',
      title: ticket.title,
      description: 'ticket temporal para la captura',
      priority: 'medium',
      status: ticket.previousStatus,
      attachments: [],
    })
    const out = await postWebhook(apiKey, {
      stTicketId: ticket.id,
      status: ticket.status,
      previousStatus: ticket.previousStatus,
      requesterEmail: email,
      title: ticket.title,
      changedAt: new Date().toISOString(),
      source: ticket.source,
    })
    console.log(`Webhook ${ticket.status}: ${out.status} ${out.text}`)
    await new Promise((r) => setTimeout(r, 1200))
  }

  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  await page.goto(`${APP_ORIGIN}/`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('form').getByRole('button', { name: /Iniciar sesión/ }).click()
  await page.getByText('Sesión activa', { exact: false }).waitFor({ timeout: 60_000 })
  await page.getByRole('link', { name: /Entrar a la Intranet/ }).click()

  const bell = page.getByTestId('notification-bell-button')
  try {
    await bell.waitFor({ timeout: 30_000 })
  } catch (err) {
    await page.screenshot({ path: resolve(OUTPUT_DIR, 'debug-login.png'), fullPage: true })
    console.error(`URL: ${page.url()}`)
    console.error((await page.locator('body').innerText()).slice(0, 1200))
    throw err
  }
  await bell.click()

  const items = page.getByTestId('notification-st-ticket')
  await items.first().waitFor({ timeout: 30_000 })
  const count = await items.count()
  console.log(`Notificaciones de soporte visibles en la campanita: ${count}`)
  for (let i = 0; i < count; i += 1) {
    console.log(`  • ${(await items.nth(i).innerText()).replace(/\n/g, ' | ')}`)
  }
  if (count !== tickets.length) throw new Error(`Esperaba ${tickets.length} notificaciones, hay ${count}`)

  await page.waitForTimeout(600)
  await page.screenshot({ path: SHOT_PANEL })
  await items.first().screenshot({ path: SHOT_ITEM })

  // El click debe llevar a /soporte-ti.
  await items.first().click()
  await page.waitForURL(/\/soporte-ti$/, { timeout: 30_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: SHOT_DESTINO })
  console.log(`Deep link OK: ${page.url()}`)

  console.log(`\nCapturas:\n  ${SHOT_PANEL}\n  ${SHOT_ITEM}\n  ${SHOT_DESTINO}`)
}

async function cleanup() {
  if (browser) await browser.close().catch(() => {})
  if (!db || !uid) return
  try {
    const notifs = await db.collection('users').doc(uid).collection('notifications').get()
    for (const doc of notifs.docs) await doc.ref.delete()
    await db.collection('users').doc(uid).delete()
    for (const ticket of [...tickets, openTicket]) {
      await db.collection('stTicketLinks').doc(String(ticket.id)).delete()
    }
    await getAuth().deleteUser(uid)
    console.log(`\n🧹 Limpieza OK: usuario ${uid}, ${tickets.length} stTicketLinks y notificaciones eliminados`)
  } catch (err) {
    console.error('⚠️  Limpieza incompleta:', err instanceof Error ? err.message : err)
  }
}

main()
  .then(cleanup)
  .catch(async (err) => {
    console.error(`\n❌ ${err instanceof Error ? err.message : err}`)
    await cleanup()
    process.exit(1)
  })
