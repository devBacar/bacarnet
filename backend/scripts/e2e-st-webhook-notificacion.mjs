/**
 * Verifica el webhook de estado de ST → notificación in-app en Bacarnet.
 * Crea un usuario Auth y un stTicketLinks temporales, dispara el webhook real
 * con la API key compartida y confirma la notificación en Firestore. Limpia todo.
 *
 * Uso: node backend/scripts/e2e-st-webhook-notificacion.mjs [--local]
 */
import { getAuth } from 'firebase-admin/auth'
import { generateEphemeralPassword } from './lib/testSecrets.mjs'
import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

const LOCAL = process.argv.includes('--local')
const BASE = LOCAL ? 'http://127.0.0.1:8797' : 'https://api-u4bp6pm7aa-rj.a.run.app'
const WEBHOOK_URL = `${BASE}/api/st-tickets/webhooks/estado`

const runId = Date.now()
const stTicketId = 999_000_000 + (runId % 1_000_000)
const email = `e2e.st.webhook.${runId}@bacarsa.com.ar`
const ticketTitle = `E2E webhook ${runId}`

const results = []
let uid = null
let db = null

function record(label, ok, detail = '') {
  results.push({ label, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) throw new Error(`${label}${detail ? `: ${detail}` : ''}`)
}

async function postWebhook(apiKey, body) {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    // respuesta no JSON
  }
  return { status: res.status, json, text }
}

async function findNotification(expectedStatus) {
  const snap = await db.collection('users').doc(uid).collection('notifications').get()
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .find((n) => n.type === 'st_ticket_status_changed' && n.context?.status === expectedStatus)
}

async function main() {
  loadTestEnv()
  initAdmin()
  db = getAdminDb()
  const auth = getAuth()

  const apiKey = process.env.ST_INTEGRATION_API_KEY?.trim()
  if (!apiKey) throw new Error('Falta ST_INTEGRATION_API_KEY en backend/.env.local')

  const ephemeralPassword = generateEphemeralPassword()
  const user = await auth.createUser({ email, password: ephemeralPassword, displayName: 'E2E Webhook' })
  uid = user.uid
  await db.collection('users').doc(uid).set({ email, displayName: 'E2E Webhook', role: 'user' })
  await db.collection('stTicketLinks').doc(String(stTicketId)).set({
    stTicketId,
    ownerUid: uid,
    requesterEmail: email,
    requesterNombre: 'E2E Webhook',
    title: ticketTitle,
    description: 'ticket temporal de verificación',
    priority: 'medium',
    status: 'open',
    attachments: [],
  })
  record('Setup: usuario y stTicketLinks temporales creados', true, `uid=${uid} stTicketId=${stTicketId}`)

  // 1) API key inválida → 401, sin notificación.
  const bad = await postWebhook('clave-invalida', { stTicketId, status: 'in-progress' })
  record('API key inválida rechazada con 401', bad.status === 401, `status=${bad.status}`)

  // 2) Cambio hecho por un agente → notificación.
  const agenteChangedAt = new Date().toISOString()
  const agente = await postWebhook(apiKey, {
    stTicketId,
    status: 'in-progress',
    previousStatus: 'open',
    requesterEmail: email,
    title: ticketTitle,
    changedAt: agenteChangedAt,
    source: 'agent',
  })
  record('Webhook de agente responde 200', agente.status === 200, `body=${agente.text}`)
  record('Respuesta indica notified=true', agente.json?.notified === true, `body=${agente.text}`)

  const notif = await findNotification('in-progress')
  record('Notificación in-app escrita en Firestore', Boolean(notif), notif ? `docId=${notif.id}` : 'no encontrada')
  record('Notificación apunta a /soporte-ti', notif?.deepLink?.path === '/soporte-ti', String(notif?.deepLink?.path))
  record('Notificación sin leer', notif?.read === false, `read=${String(notif?.read)}`)
  record(
    'Título y cuerpo en español con el estado correcto',
    notif?.title === 'Pedido en atención' && String(notif?.body).includes(ticketTitle),
    `${notif?.title} | ${notif?.body}`,
  )
  record(
    'Estado previo traducido (Recibido, no "open")',
    String(notif?.body).includes('Recibido') && !String(notif?.body).includes('open'),
    String(notif?.body),
  )

  const linkSnap = await db.collection('stTicketLinks').doc(String(stTicketId)).get()
  record('Estado sincronizado en stTicketLinks', linkSnap.get('status') === 'in-progress', String(linkSnap.get('status')))

  record('Notificación guarda el changedAt del cambio', notif?.context?.changedAt === agenteChangedAt, String(notif?.context?.changedAt))

  // 3) Reintento idéntico de ST → idempotente (no duplica).
  await postWebhook(apiKey, {
    stTicketId,
    status: 'in-progress',
    previousStatus: 'open',
    requesterEmail: email,
    title: ticketTitle,
    changedAt: agenteChangedAt,
    source: 'agent',
  })
  const afterRetry = await db.collection('users').doc(uid).collection('notifications').get()
  const inProgressCount = afterRetry.docs.filter((d) => d.get('context')?.status === 'in-progress').length
  record('Reintento no duplica la notificación', inProgressCount === 1, `count=${inProgressCount}`)

  // 4) Cambio hecho por el propio solicitante → no se autonotifica.
  const propio = await postWebhook(apiKey, {
    stTicketId,
    status: 'open',
    previousStatus: 'in-progress',
    requesterEmail: email,
    title: ticketTitle,
    changedAt: new Date().toISOString(),
    source: 'client',
  })
  record('Cambio del propio solicitante no notifica', propio.json?.notified === false, `body=${propio.text}`)

  // 5) Cierre automático por cron → notificación con texto de inactividad.
  const cron = await postWebhook(apiKey, {
    stTicketId,
    status: 'closed',
    previousStatus: 'resolved',
    requesterEmail: email,
    title: ticketTitle,
    changedAt: new Date().toISOString(),
    source: 'cron',
  })
  record('Webhook del cron responde 200 y notifica', cron.json?.notified === true, `body=${cron.text}`)
  const closedNotif = await findNotification('closed')
  record(
    'Notificación de cierre explica la inactividad',
    String(closedNotif?.body).includes('inactividad'),
    String(closedNotif?.body),
  )

  // 6) Ticket que no salió de Bacarnet → se ignora sin error.
  const ajeno = await postWebhook(apiKey, { stTicketId: 424_242_424, status: 'closed' })
  record('Ticket ajeno a Bacarnet se ignora', ajeno.json?.skipped === true, `body=${ajeno.text}`)
}

async function cleanup() {
  if (!db || !uid) return
  try {
    const notifs = await db.collection('users').doc(uid).collection('notifications').get()
    for (const doc of notifs.docs) await doc.ref.delete()
    await db.collection('users').doc(uid).delete()
    await db.collection('stTicketLinks').doc(String(stTicketId)).delete()
    await getAuth().deleteUser(uid)
    console.log(`\n🧹 Limpieza OK: usuario ${uid}, stTicketLinks/${stTicketId} y notificaciones eliminados`)
  } catch (err) {
    console.error('⚠️  Limpieza incompleta:', err instanceof Error ? err.message : err)
  }
}

main()
  .then(async () => {
    await cleanup()
    console.log(`\n✅ ${results.length} verificaciones OK`)
  })
  .catch(async (err) => {
    console.error(`\n❌ ${err instanceof Error ? err.message : err}`)
    await cleanup()
    process.exit(1)
  })
