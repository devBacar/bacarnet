/**

 * E2E colaboradores Sistemas + solicitante (Playwright + API).

 *

 *   npm --prefix backend run build

 *   node backend/scripts/e2e-helpdesk-colaboradores.mjs

 */



import { spawn } from 'node:child_process'

import { existsSync, mkdirSync } from 'node:fs'

import { dirname, resolve } from 'node:path'

import { fileURLToPath } from 'node:url'

import { FieldValue, Timestamp } from 'firebase-admin/firestore'

import { getAuth } from 'firebase-admin/auth'

import { chromium } from 'playwright'

import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

import { deleteHelpdeskTicketFull } from './helpdesk-e2e-cleanup.mjs'



const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output')

const VITE_PORT = Number(process.env.E2E_VITE_PORT ?? 5174)

const API_PORT = Number(process.env.HELPDESK_TEST_PORT ?? 8799)

const VITE = `http://127.0.0.1:${VITE_PORT}`

const API = `http://127.0.0.1:${API_PORT}`



const SCREEN_PANEL = resolve(OUT, 'colaboradores-panel-sistemas.png')

const SCREEN_MIS_OWNER = resolve(OUT, 'colaboradores-mis-proyectos-dueno.png')

const SCREEN_MIS_LECTOR = resolve(OUT, 'colaboradores-mis-proyectos-lector.png')

const SCREEN_MIS_EDITOR = resolve(OUT, 'colaboradores-mis-proyectos-editor.png')



const E2E_AREA = 'E2E Colaboradores Desarrollo'



const results = []

let ticketId = null

const cleanupAuthUids = []

const cleanupTeamDocIds = []



function record(label, ok, detail = '') {

  results.push({ label, ok, detail })

  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)

}



async function waitOk(url, timeoutMs = 120_000) {

  const start = Date.now()

  while (Date.now() - start < timeoutMs) {

    try {

      if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return

    } catch {

      /* retry */

    }

    await new Promise((r) => setTimeout(r, 500))

  }

  throw new Error(`Timeout ${url}`)

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

    throw new Error(payload.error?.message ?? 'idToken falló')

  }

  return payload.idToken

}



async function ensureCorporateUser(auth, db, label, prefix) {

  const email = `${prefix}.${Date.now()}@bacarsa.com.ar`

  const user = await auth.createUser({ email, emailVerified: true, displayName: label })

  cleanupAuthUids.push(user.uid)

  await db.collection('users').doc(user.uid).set({

    email,

    displayName: label,

    department: 'E2E',

    role: 'user',

    accountType: 'corporate',

    accountStatus: 'active',

    permissions: {

      view_directory: true,

      view_drive: true,

      view_links: true,

      manage_news: false,

      manage_links: false,

      manage_users: false,

      super_admin: false,

      rag_assistant: false,

    },

  })

  return { uid: user.uid, email, displayName: label }

}



async function ensureTeamMember(auth, db, label, prefix) {

  const corp = await ensureCorporateUser(auth, db, label, prefix)

  const teamRef = db.collection('helpdeskTeam').doc()

  cleanupTeamDocIds.push(teamRef.id)

  await teamRef.set({

    uid: corp.uid,

    nombre: label,

    email: corp.email,

    rol: 'E2E',

    activo: true,

    primeraReunion: true,

    responsablePrincipal: false,

    createdAt: FieldValue.serverTimestamp(),

  })

  return { ...corp, teamDocId: teamRef.id }

}



/** Home muestra el rótulo con CSS uppercase; además hay que esperar getUserProfile (Firestore). */

async function signIn(page, uid) {

  await page.goto(`${VITE}/`, { waitUntil: 'domcontentloaded' })

  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function', {
    timeout: 120_000,
  })

  const customToken = await getAuth().createCustomToken(uid)

  await page.evaluate(async (t) => {

    await window.__e2eSignInWithCustomToken(t)

  }, customToken)

  await page.getByText(/sesión activa/i).waitFor({ timeout: 90_000 })
}



async function gotoMisProyectos(page) {
  await page.goto(`${VITE}/mis-solicitudes-sistemas`, { waitUntil: 'domcontentloaded' })
  await page
    .getByText('Cargando proyectos…')
    .waitFor({ state: 'hidden', timeout: 90_000 })
    .catch(() => {})
  const hasResumen = await page
    .getByTestId('helpdesk-mis-proyectos-resumen')
    .waitFor({ timeout: 90_000 })
    .then(() => true)
    .catch(() => false)
  record('UI Mis proyectos cargó listado', hasResumen)
  if (!hasResumen) {
    const body = await page.locator('body').innerText().catch(() => '')
    throw new Error(
      `Mis proyectos sin listado (¿CORS? Vite ${VITE_PORT} → API ${API_PORT}). Fragmento: ${body.slice(0, 400)}`,
    )
  }
}



async function expandTicket(page, ticketId) {

  const card = page.locator(`[data-ticket-id="${ticketId}"]`)

  await card.getByTestId('helpdesk-mis-solicitud-row').waitFor({ timeout: 60_000 })

  await card.getByTestId('helpdesk-mis-solicitud-row').click()

  await card.getByTestId('helpdesk-mis-solicitud-expanded-body').waitFor({ timeout: 30_000 })

  return card

}



async function main() {

  loadTestEnv()

  initAdmin()

  const db = getAdminDb()

  const auth = getAuth()



  const teamPrimaryUser = await ensureTeamMember(auth, db, 'E2E Team Primary', 'e2e.team.primary')

  const teamSecondaryUser = await ensureTeamMember(auth, db, 'E2E Team Secondary', 'e2e.team.secondary')



  const owner = await ensureCorporateUser(auth, db, 'E2E Dueño', 'e2e.owner')

  const lectorUser = await ensureCorporateUser(auth, db, 'E2E Lector', 'e2e.lector')

  const editorUser = await ensureCorporateUser(auth, db, 'E2E Editor', 'e2e.editor')

  const outsider = await ensureCorporateUser(auth, db, 'E2E Outsider', 'e2e.outsider')



  const ticketRef = db.collection('helpdeskTickets').doc()

  ticketId = ticketRef.id

  await ticketRef.set({

    token: `e2e-colab-${Date.now()}`,

    requesterUid: owner.uid,

    requesterEmail: owner.email,

    requesterNombre: owner.displayName ?? 'Dueño E2E',

    areaId: 'e2e-colab',

    areaNombre: E2E_AREA,

    problematica: 'Proyecto E2E colaboradores',

    urgencia: 'media',

    estadoIdx: 4,

    asignadoATeamId: teamPrimaryUser.teamDocId,

    colaboradoresSistemas: [],

    colaboradoresSolicitante: [],

    colaboradorUids: [],

    colaboradorEmails: [],

    createdAt: Timestamp.now(),

  })



  const { app } = await import('../lib/server.js')

  const server = await new Promise((resolvePromise, reject) => {

    const s = app.listen(API_PORT, '127.0.0.1', (err) => (err ? reject(err) : resolvePromise(s)))

  })

  const vite = spawn(

    'npx',

    ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],

    {

      cwd: ROOT,

      env: {
        ...process.env,
        VITE_API_BASE_URL: API,
        HELPDESK_TEST_PORT: String(API_PORT),
        VITE_E2E: 'true',
      },

      shell: true,

      stdio: 'ignore',

    },

  )



  try {

    await waitOk(`${API}/api/health`)

    await waitOk(VITE)



    const ownerToken = await idTokenForUid(owner.uid)

    const lectorToken = await idTokenForUid(lectorUser.uid)

    const editorToken = await idTokenForUid(editorUser.uid)

    const outsiderToken = await idTokenForUid(outsider.uid)

    const teamToken = await idTokenForUid(teamPrimaryUser.uid)



    record('Dueño invita lector (API)', (

      await fetch(`${API}/api/helpdesk/tickets/${ticketId}/colaboradores`, {

        method: 'POST',

        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },

        body: JSON.stringify({ email: lectorUser.email, rol: 'lector' }),

      })

    ).status === 201)



    record('Dueño invita editor (API)', (

      await fetch(`${API}/api/helpdesk/tickets/${ticketId}/colaboradores`, {

        method: 'POST',

        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },

        body: JSON.stringify({ email: editorUser.email, rol: 'editor' }),

      })

    ).status === 201)



    const outsiderBody = await (

      await fetch(`${API}/api/helpdesk/tickets/mias`, {

        headers: { Authorization: `Bearer ${outsiderToken}`, Accept: 'application/json' },

      })

    ).json()

    record('Usuario sin invitación no ve el proyecto', !(outsiderBody.tickets ?? []).some((t) => t.id === ticketId))



    const lectorBody = await (

      await fetch(`${API}/api/helpdesk/tickets/mias`, {

        headers: { Authorization: `Bearer ${lectorToken}`, Accept: 'application/json' },

      })

    ).json()

    const lectorTicket = (lectorBody.tickets ?? []).find((t) => t.id === ticketId)

    record('Lector ve proyecto en /mias', Boolean(lectorTicket))

    record('Lector miRolAcceso=lector', lectorTicket?.miRolAcceso === 'lector')



    const lectorForm = new FormData()

    lectorForm.append('texto', 'Intento lector API')

    record(

      'Lector no puede comentar (API)',

      (

        await fetch(`${API}/api/helpdesk/tickets/${ticketId}/bitacora`, {

          method: 'POST',

          headers: { Authorization: `Bearer ${lectorToken}` },

          body: lectorForm,

        })

      ).status === 403,

    )



    record(

      'Equipo agrega colaborador Sistemas (API)',

      (

        await fetch(`${API}/api/helpdesk/tickets/${ticketId}/colaboradores-sistemas`, {

          method: 'POST',

          headers: { Authorization: `Bearer ${teamToken}`, 'Content-Type': 'application/json' },

          body: JSON.stringify({ teamMemberId: teamSecondaryUser.teamDocId }),

        })

      ).status === 201,

    )



    await new Promise((r) => setTimeout(r, 1200))

    const notifSnap = await db

      .collection('users')

      .doc(teamSecondaryUser.uid)

      .collection('notifications')

      .orderBy('createdAt', 'desc')

      .limit(8)

      .get()

    record(

      'Notificación in-app colaborador Sistemas',

      notifSnap.docs.some((d) => d.get('type') === 'helpdesk_colaborador_sistemas'),

    )



    mkdirSync(OUT, { recursive: true })

    const browser = await chromium.launch({ headless: true })



    // 1) Dueño — bloque Colaboradores con lector + editor

    const pageOwner = await browser.newPage({ viewport: { width: 1280, height: 960 } })

    await signIn(pageOwner, owner.uid)

    await gotoMisProyectos(pageOwner)

    await expandTicket(pageOwner, ticketId)

    const ownerColab = pageOwner.getByTestId('helpdesk-colaboradores-solicitante')

    await ownerColab.waitFor({ timeout: 30_000 })

    const ownerColabText = await ownerColab.innerText()

    record('UI dueño: lista lector invitado', ownerColabText.toLowerCase().includes(lectorUser.email))

    record('UI dueño: lista editor invitado', ownerColabText.toLowerCase().includes(editorUser.email))

    await pageOwner.screenshot({ path: SCREEN_MIS_OWNER, fullPage: true })

    record('Screenshot Mis proyectos (dueño)', existsSync(SCREEN_MIS_OWNER))



    // 2) Lector — sin campo de comentario

    const pageLector = await browser.newPage({ viewport: { width: 1280, height: 960 } })

    await signIn(pageLector, lectorUser.uid)

    await gotoMisProyectos(pageLector)

    await expandTicket(pageLector, ticketId)

    await pageLector.getByTestId('helpdesk-mis-proyectos-rol-etiqueta').waitFor({ timeout: 15_000 })

    const lectorTextareaCount = await pageLector.getByTestId('helpdesk-bitacora-texto').count()

    const lectorPublishCount = await pageLector.getByTestId('helpdesk-bitacora-publicar').count()

    record('UI lector: sin textarea bitácora', lectorTextareaCount === 0, `count=${lectorTextareaCount}`)

    record('UI lector: sin botón publicar', lectorPublishCount === 0, `count=${lectorPublishCount}`)

    await pageLector.screenshot({ path: SCREEN_MIS_LECTOR, fullPage: true })

    record('Screenshot Mis proyectos (lector)', existsSync(SCREEN_MIS_LECTOR))



    // 3) Editor — comenta en UI y aparece en el feed

    const pageEditor = await browser.newPage({ viewport: { width: 1280, height: 960 } })

    await signIn(pageEditor, editorUser.uid)

    await gotoMisProyectos(pageEditor)

    await expandTicket(pageEditor, ticketId)

    const editorCommentUi = `Comentario UI editor ${Date.now()}`

    await pageEditor.getByTestId('helpdesk-bitacora-texto').fill(editorCommentUi)

    const bitacoraPost = pageEditor.waitForResponse(

      (res) =>

        res.url().includes('/bitacora') &&

        res.request().method() === 'POST' &&

        res.status() !== 0,

      { timeout: 60_000 },

    )

    await pageEditor.getByTestId('helpdesk-bitacora-publicar').click()

    const postRes = await bitacoraPost

    record('UI editor: POST bitácora 201', postRes.status() === 201, `status ${postRes.status()}`)

    await pageEditor.getByTestId('helpdesk-bitacora-feed').getByText(editorCommentUi).waitFor({

      timeout: 30_000,

    })

    record('UI editor: comentario visible en feed', true)

    await pageEditor.screenshot({ path: SCREEN_MIS_EDITOR, fullPage: true })

    record('Screenshot Mis proyectos (editor)', existsSync(SCREEN_MIS_EDITOR))



    // 4) Panel Sistemas — colaboradores

    const pageTeam = await browser.newPage({ viewport: { width: 1400, height: 960 } })

    await signIn(pageTeam, teamPrimaryUser.uid)

    const teamListRes = pageTeam.waitForResponse(

      (res) => res.url().includes('/api/helpdesk/tickets') && res.request().method() === 'GET',

      { timeout: 90_000 },

    )

    await pageTeam.goto(`${VITE}/sistemas/mesa-ayuda?ticket=${ticketId}`, {

      waitUntil: 'domcontentloaded',

    })

    await teamListRes

    await pageTeam.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 90_000 })

    const colabPanel = pageTeam.getByTestId('helpdesk-colaboradores-sistemas')

    await colabPanel.waitFor({ timeout: 45_000 })

    const panelText = await colabPanel.innerText()

    record(

      'UI panel: colaborador Sistemas listado',

      panelText.includes(teamSecondaryUser.email) || panelText.includes('E2E Team Secondary'),

    )

    await pageTeam.screenshot({ path: SCREEN_PANEL, fullPage: true })

    record('Screenshot panel Sistemas', existsSync(SCREEN_PANEL))



    await browser.close()

  } finally {

    vite.kill('SIGTERM')

    server.close()

    if (ticketId) await deleteHelpdeskTicketFull(ticketId).catch(() => {})

    for (const teamDocId of cleanupTeamDocIds) {

      await db.collection('helpdeskTeam').doc(teamDocId).delete().catch(() => {})

    }

    for (const uid of cleanupAuthUids) {

      await db.collection('users').doc(uid).delete().catch(() => {})

      await auth.deleteUser(uid).catch(() => {})

    }

  }



  const failed = results.filter((r) => !r.ok)

  if (failed.length) {

    console.error('\nFallos:', failed)

    process.exit(1)

  }

  console.log('\nTodos los checks pasaron.')

  console.log(`Capturas en ${OUT}`)

}



main().catch((err) => {

  console.error(err)

  process.exit(1)

})


