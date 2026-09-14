/**
 * E2E: cancelación manual, subida/aprobación/rechazo de análisis (sin correo a Pablo).
 *
 *   npm --prefix backend run build
 *   node backend/scripts/e2e-helpdesk-analisis.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const VITE_PORT = 5188 + (Date.now() % 100)
const API_PORT = 8800 + (Date.now() % 100)
const VITE = `http://127.0.0.1:${VITE_PORT}`
const API = `http://127.0.0.1:${API_PORT}`

const TEST_APROBADOR = `prueba.helpdesk.aprobador+${Date.now()}@bacarsa.com.ar`
const MIN_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj trailer<</Root 1 0 R>>',
  'utf8',
)

async function waitOk(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`timeout ${url}`)
}

async function getIdToken(email) {
  const auth = getAuth()
  const user = await auth.getUserByEmail(email)
  const custom = await auth.createCustomToken(user.uid)
  const apiKey = process.env.VITE_FIREBASE_API_KEY?.trim()
  if (!apiKey) throw new Error('VITE_FIREBASE_API_KEY')
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    },
  )
  const body = await res.json()
  if (!body.idToken) throw new Error(JSON.stringify(body))
  return body.idToken
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

let requester = null
const usersSnapshot = await db.collection('users').limit(100).get()
for (const userDoc of usersSnapshot.docs) {
  const email = String(userDoc.get('email') ?? '').trim().toLowerCase()
  if (!email || teamEmails.has(email)) continue
  if (userDoc.get('accountType') === 'external' || userDoc.get('active') === false) continue
  try {
    requester = await auth.getUserByEmail(email)
    break
  } catch {
    // skip
  }
}
if (!requester?.email) throw new Error('No solicitante E2E')

let approverUser = null
try {
  approverUser = await auth.getUserByEmail(TEST_APROBADOR)
} catch {
  approverUser = await auth.createUser({
    email: TEST_APROBADOR,
    emailVerified: true,
    displayName: 'Aprobador E2E Helpdesk',
    password: process.env.E2E_TEST_USER_PASSWORD ?? 'E2ETestOnlyPasswordNotForProd1',
  })
  await db.collection('users').doc(approverUser.uid).set(
    {
      email: TEST_APROBADOR,
      displayName: 'Aprobador E2E Helpdesk',
      accountType: 'corporate',
      active: true,
      role: 'user',
    },
    { merge: true },
  )
}

const suffix = Date.now()
const ticketApproveRef = db.collection('helpdeskTickets').doc()
const ticketRejectRef = db.collection('helpdeskTickets').doc()

const baseTicket = {
  token: `e2e-analisis-${suffix}`,
  requesterUid: requester.uid,
  requesterEmail: requester.email,
  requesterNombre: requester.displayName || 'Solicitante E2E',
  areaId: `e2e-${suffix}`,
  urgencia: 'baja',
  asignadoATeamId: null,
  cancelado: false,
  createdAt: Timestamp.now(),
}

await ticketApproveRef.set({
  ...baseTicket,
  areaNombre: `E2E Análisis Aprobar ${suffix}`,
  problematica: 'Ticket para aprobar análisis',
  estadoIdx: 2,
})
await ticketRejectRef.set({
  ...baseTicket,
  areaNombre: `E2E Análisis Rechazar ${suffix}`,
  problematica: 'Ticket para rechazar análisis',
  estadoIdx: 2,
})

process.env.HELPDESK_N8N_WEBHOOK_ANALISIS_PENDIENTE = ''
process.env.HELPDESK_N8N_WEBHOOK_ESTADO_CAMBIADO = ''
process.env.HELPDESK_N8N_WEBHOOK_AVISO_INTERNO = ''

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
  { cwd: ROOT, stdio: 'inherit', shell: true },
)

try {
  await waitOk(`${API}/api/health`)
  await waitOk(VITE)

  const teamToken = await getIdToken('admin@bacarsa.com.ar')
  const approverToken = await getIdToken(TEST_APROBADOR)

  async function uploadAnalisis(ticketId) {
    const form = new FormData()
    form.append('file', new Blob([MIN_PDF], { type: 'application/pdf' }), `e2e-analisis-${suffix}.pdf`)
    form.append('aprobadoresEmails', TEST_APROBADOR)
    const res = await fetch(`${API}/api/helpdesk/tickets/${ticketId}/analisis`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teamToken}` },
      body: form,
    })
    const body = await res.json()
    if (!res.ok) throw new Error(`upload ${ticketId}: ${res.status} ${JSON.stringify(body)}`)
    return body.analisisId
  }

  const analisisApproveId = await uploadAnalisis(ticketApproveRef.id)
  const analisisRejectId = await uploadAnalisis(ticketRejectRef.id)

  const approveRes = await fetch(
    `${API}/api/helpdesk/tickets/${ticketApproveRef.id}/analisis/${analisisApproveId}/decision`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${approverToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'aprobado', comentario: 'OK E2E' }),
    },
  )
  if (!approveRes.ok) throw new Error(`approve: ${await approveRes.text()}`)

  const rejectRes = await fetch(
    `${API}/api/helpdesk/tickets/${ticketRejectRef.id}/analisis/${analisisRejectId}/decision`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${approverToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'rechazado' }),
    },
  )
  if (!rejectRes.ok) throw new Error(`reject: ${await rejectRes.text()}`)

  const snapApprove = await ticketApproveRef.get()
  if (snapApprove.get('estadoIdx') !== 3) throw new Error('estadoIdx no avanzó a 3')

  const avanceRes = await fetch(`${API}/api/helpdesk/tickets/${ticketApproveRef.id}/bitacora`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${teamToken}` },
    body: (() => {
      const form = new FormData()
      form.append('texto', `Avance E2E ${suffix}`)
      return form
    })(),
  })
  if (!avanceRes.ok) throw new Error(`bitacora avance: ${await avanceRes.text()}`)

  const requesterToken = await getIdToken(requester.email)
  const comentRes = await fetch(`${API}/api/helpdesk/tickets/${ticketApproveRef.id}/bitacora`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${requesterToken}` },
    body: (() => {
      const form = new FormData()
      form.append('texto', `Comentario E2E ${suffix}`)
      return form
    })(),
  })
  if (!comentRes.ok) throw new Error(`bitacora comentario: ${await comentRes.text()}`)

  const bitacoraGet = await fetch(`${API}/api/helpdesk/tickets/${ticketApproveRef.id}/bitacora`, {
    headers: { Authorization: `Bearer ${teamToken}` },
  })
  const bitacoraBody = await bitacoraGet.json()
  if (
    !bitacoraBody.entradas?.some((e) => e.tipo === 'avance' && e.texto.includes(String(suffix))) ||
    !bitacoraBody.entradas?.some((e) => e.tipo === 'comentario' && e.texto.includes(String(suffix)))
  ) {
    throw new Error(`bitácora incompleta: ${JSON.stringify(bitacoraBody)}`)
  }
  const snapReject = await ticketRejectRef.get()
  if (snapReject.get('estadoIdx') !== 2) throw new Error('rechazo no debe cambiar estadoIdx')
  if (snapReject.get('cancelado') === true) throw new Error('rechazo no debe cancelar ticket')

  const cancelRes = await fetch(`${API}/api/helpdesk/tickets/${ticketRejectRef.id}/cancelacion`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${teamToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cancelado: true, motivo: 'Prueba cancelación E2E' }),
  })
  if (!cancelRes.ok) throw new Error(`cancel: ${await cancelRes.text()}`)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(`${VITE}/login`)
  await page.evaluate(async (token) => {
    localStorage.setItem('bacarnet:idToken', token)
  }, await getIdToken('admin@bacarsa.com.ar'))
  await page.goto(`${VITE}/sistemas/mesa-ayuda`)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: resolve(ROOT, 'backend/scripts/output/e2e-mesa-ayuda-analisis.png'), fullPage: true })

  await page.evaluate(async (token) => {
    localStorage.setItem('bacarnet:idToken', token)
  }, approverToken)
  await page.goto(`${VITE}/aprobaciones-pendientes`)
  await page.waitForTimeout(1500)
  await page.screenshot({
    path: resolve(ROOT, 'backend/scripts/output/e2e-aprobaciones-pendientes.png'),
    fullPage: true,
  })
  await browser.close()

  console.log('E2E análisis OK')
} finally {
  vite.kill('SIGTERM')
  server.close()
  await ticketApproveRef.delete()
  await ticketRejectRef.delete()
  for (const ticketId of [ticketApproveRef.id, ticketRejectRef.id]) {
    for (const sub of ['analisis', 'bitacora']) {
      const snap = await db.collection('helpdeskTickets').doc(ticketId).collection(sub).get()
      for (const doc of snap.docs) await doc.ref.delete()
    }
  }
  try {
    await auth.deleteUser(approverUser.uid)
  } catch {
    // ignore
  }
  await db.collection('users').doc(approverUser.uid).delete()
  if (wroteEnv) unlinkSync(envDevLocal)
}
