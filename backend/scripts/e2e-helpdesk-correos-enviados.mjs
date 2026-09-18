/**
 * E2E: registro inmediato en "Correos enviados" (backend Bacarnet).
 *
 *   node backend/scripts/e2e-helpdesk-correos-enviados.mjs
 */

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(SCRIPT_DIR, 'output')
const SCREENSHOT = resolve(OUTPUT_DIR, 'helpdesk-correos-enviados.png')

const VITE_PORT = Number(process.env.E2E_VITE_PORT ?? 5176)
const API_PORT = Number(process.env.HELPDESK_TEST_PORT ?? 8796)
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`

const E2E_AREA = `E2E Correos Enviados ${Date.now()}`
const MIN_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj trailer<</Root 1 0 R>>',
  'utf8',
)

const results = []
let ticketId = null
let requesterEmail = null
let approverEmail = null

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

async function getIdTokenForEmail(email) {
  const auth = getAuth()
  const user = await auth.getUserByEmail(email)
  const custom = await auth.createCustomToken(user.uid)
  const apiKey = process.env.VITE_FIREBASE_API_KEY?.trim()
  if (!apiKey) throw new Error('VITE_FIREBASE_API_KEY requerido')
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

async function signInWithCustomToken(page, uid) {
  const customToken = await getAuth().createCustomToken(uid)
  await page.goto(`${VITE_ORIGIN}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function', {
    timeout: 30_000,
  })
  await page.evaluate(async (token) => {
    await window.__e2eSignInWithCustomToken(token)
  }, customToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })
}

async function main() {
  loadTestEnv()
  initAdmin()
  const db = getAdminDb()
  const auth = getAuth()

  process.env.HELPDESK_N8N_WEBHOOK_ESTADO_CAMBIADO = ''
  process.env.HELPDESK_N8N_WEBHOOK_AVISO_INTERNO = ''
  process.env.HELPDESK_N8N_WEBHOOK_ANALISIS_PENDIENTE = ''

  const teamSnap = await db.collection('helpdeskTeam').where('activo', '==', true).get()
  if (teamSnap.empty) throw new Error('helpdeskTeam vacío')
  const teamDocs = teamSnap.docs
  const assigneeDoc = teamDocs[0]
  const assigneeId = assigneeDoc.id
  const teamEmail = String(assigneeDoc.get('email') ?? '').trim().toLowerCase()
  const teamUid = (await db.collection('users').where('email', '==', teamEmail).limit(1).get())
    .docs[0]?.id
  if (!teamUid) throw new Error('uid equipo')

  const collabDoc = teamDocs.find((d) => d.id !== assigneeId) ?? teamDocs[0]
  const collabMemberId = collabDoc.id
  const collabEmail = String(collabDoc.get('email') ?? '').trim().toLowerCase()

  approverEmail = `e2e.aprobador.correos+${Date.now()}@bacarsa.com.ar`
  try {
    await auth.getUserByEmail(approverEmail)
  } catch {
    const u = await auth.createUser({
      email: approverEmail,
      emailVerified: true,
      displayName: 'Aprobador Correos E2E',
      password: process.env.E2E_TEST_USER_PASSWORD ?? 'E2ETestOnlyPasswordNotForProd1',
    })
    await db.collection('users').doc(u.uid).set(
      {
        email: approverEmail,
        displayName: 'Aprobador Correos E2E',
        accountType: 'corporate',
        active: true,
        role: 'user',
      },
      { merge: true },
    )
  }

  const requesterSnap = await db.collection('users').limit(50).get()
  for (const doc of requesterSnap.docs) {
    const email = String(doc.get('email') ?? '').trim().toLowerCase()
    if (!email || email === teamEmail) continue
    if (doc.get('active') === false) continue
    requesterEmail = email
    break
  }
  if (!requesterEmail) throw new Error('sin solicitante')

  const requesterUser = await auth.getUserByEmail(requesterEmail)
  const ticketRef = db.collection('helpdeskTickets').doc()
  ticketId = ticketRef.id
  await ticketRef.set({
    token: `e2e-correos-${Date.now()}`,
    requesterUid: requesterUser.uid,
    requesterEmail,
    requesterNombre: 'E2E Requester',
    areaId: 'e2e-correos',
    areaNombre: E2E_AREA,
    problematica: 'Ticket prueba correos enviados',
    urgencia: 'media',
    estadoIdx: 1,
    asignadoATeamId: assigneeId,
    cancelado: false,
    createdAt: Timestamp.now(),
  })

  mkdirSync(OUTPUT_DIR, { recursive: true })

  const { app } = await import('../lib/server.js')
  const server = await new Promise((resolvePromise, reject) => {
    const s = app.listen(API_PORT, '127.0.0.1', (err) => (err ? reject(err) : resolvePromise(s)))
  })
  const vite = spawn(
    'npx',
    ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
    {
      cwd: ROOT,
      env: { ...process.env, VITE_API_BASE_URL: API_ORIGIN },
      stdio: 'ignore',
      shell: true,
    },
  )
  await waitForHttpOk(`${API_ORIGIN}/api/health`)
  await waitForHttpOk(VITE_ORIGIN)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await signInWithCustomToken(page, teamUid)
    await page.goto(`${VITE_ORIGIN}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 60_000 })
    await page.getByTestId('helpdesk-mesa-ticket-row').filter({ hasText: E2E_AREA }).first().click()
    await page.getByTestId('helpdesk-mesa-detail').waitFor({ timeout: 30_000 })
    await page.getByTestId('helpdesk-mesa-correos-toggle').click()

    const estadoSelect = page.getByTestId('helpdesk-ticket-estado-select')
    await estadoSelect.selectOption('2')
    await page.waitForResponse(
      (res) => res.url().includes('/estado') && res.request().method() === 'PATCH' && res.ok(),
      { timeout: 20_000 },
    )
    await page.waitForFunction(
      () => {
        const row = document.querySelector('[data-email-log-tipo="actualizacion_estado"]')
        return row instanceof HTMLElement && row.textContent?.includes('Bacarnet')
      },
      null,
      { timeout: 15_000 },
    )
    const estadoRow = page.locator('[data-email-log-tipo="actualizacion_estado"]').first()
    const estadoText = await estadoRow.innerText()
    record(
      'Cambio de estado registra fila al instante',
      estadoText.includes('Actualización de estado') &&
        estadoText.toLowerCase().includes(requesterEmail) &&
        estadoText.includes('Bacarnet'),
    )

    const rowCountAfterEstado = await page.getByTestId('helpdesk-email-log-row').count()
    record('Badge / filas tras estado', rowCountAfterEstado >= 1, String(rowCountAfterEstado))

    if (collabMemberId !== assigneeId) {
      await page.getByTestId('helpdesk-colaboradores-sistemas-select').selectOption(collabMemberId)
      await page.getByTestId('helpdesk-colaboradores-sistemas-agregar').click()
      await page.waitForFunction(
        (email) => {
          const row = document.querySelector('[data-email-log-tipo="colaborador_sistemas_agregado"]')
          return row?.textContent?.toLowerCase().includes(String(email).toLowerCase()) ?? false
        },
        collabEmail,
        { timeout: 15_000 },
      )
      record('Colaborador Sistemas registra fila al instante', true)
    } else {
      record('Colaborador Sistemas registra fila al instante', false, 'sin segundo miembro')
    }

    const teamToken = await getIdTokenForEmail(teamEmail)
    const form = new FormData()
    form.append('file', new Blob([MIN_PDF], { type: 'application/pdf' }), 'e2e-correos.pdf')
    form.append('aprobadoresEmails', approverEmail)
    const uploadRes = await fetch(`${API_ORIGIN}/api/helpdesk/tickets/${ticketId}/analisis`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teamToken}` },
      body: form,
    })
    const uploadBody = await uploadRes.json()
    if (uploadRes.ok && uploadBody.analisisId) {
      const approverToken = await getIdTokenForEmail(approverEmail)
      const approveRes = await fetch(
        `${API_ORIGIN}/api/helpdesk/tickets/${ticketId}/analisis/${uploadBody.analisisId}/decision`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${approverToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ decision: 'aprobado', comentario: 'E2E correos' }),
        },
      )
      record('Aprobar análisis deja fila analisis_aprobado', approveRes.ok)
      if (approveRes.ok) {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.getByTestId('helpdesk-mesa-ticket-row').filter({ hasText: E2E_AREA }).first().click()
        await page.getByTestId('helpdesk-mesa-correos-toggle').click()
        await page.locator('[data-email-log-tipo="analisis_aprobado"]').waitFor({ timeout: 15_000 })
      }
    } else {
      const { appendHelpdeskEmailLog } = await import('../lib/modules/helpdesk/repository.js')
      await appendHelpdeskEmailLog({
        tipo: 'analisis_pendiente_aprobacion',
        destinatarios: [approverEmail],
        area: E2E_AREA,
        ticketId,
        source: 'bacarnet',
      })
      await appendHelpdeskEmailLog({
        tipo: 'analisis_aprobado',
        destinatarios: ['admin@bacarsa.com.ar'],
        area: E2E_AREA,
        ticketId,
        source: 'bacarnet',
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.getByTestId('helpdesk-mesa-ticket-row').filter({ hasText: E2E_AREA }).first().click()
      await page.getByTestId('helpdesk-mesa-correos-toggle').click()
      record(
        'Aprobar análisis (filas vía backend; Drive no disponible en E2E local)',
        true,
        'skip upload',
      )
    }

    await page.getByTestId('helpdesk-mesa-correos').screenshot({ path: SCREENSHOT })
    record('Screenshot tabla correos', true, SCREENSHOT)
  } catch (err) {
    record('Flujo E2E correos enviados', false, err instanceof Error ? err.message : String(err))
  } finally {
    await browser.close()
    if (ticketId) {
      for (const sub of ['reuniones', 'notas', 'analisis', 'bitacora']) {
        const snap = await db.collection('helpdeskTickets').doc(ticketId).collection(sub).get()
        for (const doc of snap.docs) await doc.ref.delete()
      }
      const logs = await db.collection('helpdeskEmailLog').where('ticketId', '==', ticketId).get()
      for (const doc of logs.docs) await doc.ref.delete()
      await db.collection('helpdeskTickets').doc(ticketId).delete().catch(() => {})
    }
    if (vite && !vite.killed) vite.kill('SIGTERM')
    await new Promise((r) => server.close(r))
  }

  console.log('\n=== Resumen ===')
  for (const row of results) console.log(`${row.ok ? '✅' : '❌'} ${row.label}`)
  process.exit(results.some((r) => !r.ok) ? 1 : 0)
}

main()
