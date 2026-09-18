/**
 * Tablero Desarrollo · Proyectos: acceso vía boardAccess + pantalla React.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/e2e-tablero-desarrollo-proyectos.mjs
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { chromium } from 'playwright'
import { grantBoardAccess, revokeBoardAccess } from '../lib/modules/boards/boardAccess.js'
import { generateEphemeralPassword } from './lib/testSecrets.mjs'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'
import { deleteHelpdeskTicketFull } from './helpdesk-e2e-cleanup.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const VITE_PORT = 5195
const API_PORT = 8795
const VITE = `http://127.0.0.1:${VITE_PORT}`
const API = `http://127.0.0.1:${API_PORT}`

async function waitOk(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`timeout ${url}`)
}

loadTestEnv()
initAdmin()
const dbSettings = getAdminDb()
await dbSettings.collection('global_settings').doc('main').set(
  {
    boardsEnabled: true,
    resourcesEnabled: true,
    directoryEnabled: true,
    notificationsEnabled: true,
    pollsEnabled: true,
  },
  { merge: true },
)

const boardFolderId = process.env.HELPDESK_BOARD_PROYECTOS_FOLDER_ID?.trim()
if (!boardFolderId) {
  throw new Error('Definí HELPDESK_BOARD_PROYECTOS_FOLDER_ID en backend/.env.local')
}

const actor = await getTestIdToken()
const db = getAdminDb()
const ticketIds = []

function iniciativaSeed(nombre, veredicto) {
  return {
    nombre,
    beneficioEsperado: 'Mejora operativa',
    recursosRequeridos: 'Equipo interno',
    impactoEstimado: 'Medio',
    factibilidad: 'Media',
    costoEsfuerzo: 'Medio',
    urgencia: 'Deseable',
    veredicto,
  }
}

async function seedTicket(partial) {
  const ref = db.collection('helpdeskTickets').doc()
  await ref.set({
    token: `e2e-tablero-${ref.id.slice(0, 6)}`,
    requesterUid: actor.uid,
    requesterEmail: `captura.tablero+${ref.id.slice(0, 8)}@bacarsa.com.ar`,
    requesterNombre: 'Captura Tablero Proyectos',
    areaId: 'e2e-tablero',
    areaNombre: partial.areaNombre,
    problematica: partial.problematica,
    urgencia: partial.urgencia ?? 'media',
    estadoIdx: partial.estadoIdx,
    asignadoATeamId: null,
    cancelado: partial.cancelado ?? false,
    createdAt: Timestamp.now(),
  })
  ticketIds.push(ref.id)
  return ref.id
}

async function seedTicketEnCursoConMinuta() {
  const id = await seedTicket({
    areaNombre: 'Ventas (captura tablero)',
    problematica: 'Ticket temporal captura tablero en curso',
    estadoIdx: 3,
  })
  await db
    .collection('helpdeskTickets')
    .doc(id)
    .collection('reuniones')
    .doc()
    .set({
      tipo: 'Reunión inicial',
      fecha: '15/09/2026',
      hora: '10:00',
      conTeamId: 'e2e',
      participantesTeamIds: [],
      estado: 'confirmada',
      createdAt: Timestamp.now(),
      minutaDiagnostico: {
        fecha: '15/09/2026',
        facilitador: 'Facilitador E2E',
        participantes: 'Sistemas y negocio',
        objetivoSesion:
          'Automatizar la conciliación de facturación y reducir reprocesos manuales en el cierre mensual del área comercial.',
        alcance: 'Ventas y cobranzas',
        procesosEvaluados: [
          {
            procesoEvaluado: 'Facturación',
            descripcionBreve: 'Emisión y control de comprobantes',
            problemasIdentificados: 'Retrabajo manual',
            metricasActuales: '48 h de cierre',
          },
          {
            procesoEvaluado: 'Conciliación bancaria',
            descripcionBreve: 'Match de extractos',
            problemasIdentificados: 'Planillas dispersas',
            metricasActuales: '3 días',
          },
        ],
        iniciativasPropuestas: [
          iniciativaSeed('Iniciativa Alpha', 'Viable'),
          iniciativaSeed('Iniciativa Beta', 'No viable'),
        ],
        proyectosAprobados: '',
        responsables: 'Sistemas',
        accionesInmediatas: 'Validar alcance',
        updatedAt: Timestamp.now(),
      },
    })
  await db
    .collection('helpdeskTickets')
    .doc(id)
    .collection('analisis')
    .doc()
    .set({
      archivoDriveId: 'e2e-drive',
      archivoDriveLink: 'https://example.com/doc',
      subidoPorNombre: 'E2E Sistemas',
      subidoPorEmail: actor.email,
      subidoFecha: Timestamp.now(),
      aprobadoresEmails: [actor.email],
      estado: 'aprobado',
      decididoPorEmail: actor.email,
      decididoFecha: Timestamp.now(),
    })
  return id
}

await seedTicketEnCursoConMinuta()
await seedTicket({
  areaNombre: 'Finanzas (captura tablero)',
  problematica: 'Ticket temporal captura tablero finalizado',
  estadoIdx: 5,
})
await seedTicket({
  areaNombre: 'RRHH (captura tablero)',
  problematica: 'Ticket temporal captura tablero cancelado',
  estadoIdx: 2,
  cancelado: true,
})

const deniedUserEmail = `prueba.tablero.denegado+${Date.now()}@bacarsa.com.ar`
const deniedPassword = generateEphemeralPassword()
const deniedRecord = await getAuth().createUser({
  email: deniedUserEmail,
  password: deniedPassword,
  emailVerified: true,
})
await db.collection('users').doc(deniedRecord.uid).set({
  email: deniedUserEmail,
  displayName: 'E2E Tablero Denegado',
  department: 'General',
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

await grantBoardAccess({
  boardFolderId,
  boardName: 'Desarrollo · Proyectos',
  grantee: { uid: actor.uid, email: actor.email, displayName: actor.email },
  actor,
})

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
    env: {
      ...process.env,
      VITE_API_BASE_URL: API,
      VITE_HELPDESK_BOARD_PROYECTOS_FOLDER_ID: boardFolderId,
    },
    shell: true,
    stdio: 'ignore',
  },
)

try {
  await waitOk(`${API}/api/health`)
  await waitOk(VITE)
  mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

  const customToken = await getAuth().createCustomToken(actor.uid)
  await page.goto(`${VITE}/intranet`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function')
  await page.evaluate(async (t) => window.__e2eSignInWithCustomToken(t), customToken)
  await page.getByText('Sesión activa').waitFor({ timeout: 60_000 })
  await page.goto(`${VITE}/intranet`, { waitUntil: 'domcontentloaded' })
  await page.getByText('¡Hola').first().waitFor({ timeout: 60_000 }).catch(() => {})

  const apiCheck = await fetch(`${API}/api/helpdesk/tablero-proyectos`, {
    headers: { Authorization: `Bearer ${actor.idToken}` },
  })
  const apiBody = await apiCheck.json()
  if (!apiCheck.ok) {
    throw new Error(`API tablero-proyectos ${apiCheck.status} ${JSON.stringify(apiBody)}`)
  }
  console.log('API tickets:', apiBody.tickets?.length ?? 0)
  console.log('API areas:', apiBody.tickets?.map((t) => t.area).join(' | '))
  const ventasRow = apiBody.tickets?.find((t) => t.area === 'Ventas (captura tablero)')
  if (!ventasRow?.analisisResumen?.iniciativasResumen) {
    throw new Error(`Seed Ventas sin analisisResumen: ${JSON.stringify(ventasRow)}`)
  }

  await page.goto(`${VITE}/tableros/desarrollo-proyectos`, { waitUntil: 'domcontentloaded' })
  await page
    .getByTestId('tablero-desarrollo-proyectos-page')
    .or(page.getByText('Desarrollo · Proyectos'))
    .first()
    .waitFor({ timeout: 120_000 })
  await page.getByText('Desarrollo · Proyectos').waitFor()
  await page.getByText('Cargando proyectos…').waitFor({ state: 'hidden', timeout: 120_000 })

  const browserApi = await page.evaluate(async (apiBase) => {
    const token = await window.__getIdToken?.()
    if (!token) return { err: 'sin token' }
    const res = await fetch(`${apiBase}/api/helpdesk/tablero-proyectos`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    const body = await res.json().catch(() => ({}))
    return { status: res.status, areas: body.tickets?.map((t) => t.area) ?? [] }
  }, API)
  console.log('Browser tablero API:', browserApi)
  const cardCount = await page.getByTestId('tablero-proyectos-card-en-curso').count()
  console.log('UI cards en curso:', cardCount)

  const ventasCard = page.locator(`[data-ticket-id="${ventasRow.ticketId}"]`)
  await ventasCard.waitFor({ timeout: 60_000 })

  await ventasCard.getByTestId('tablero-proyectos-chip-minuta').click()
  await page.getByTestId('tablero-proyectos-panel-minuta').getByText(/Automatizar la conciliación/).waitFor()
  await ventasCard.getByTestId('tablero-proyectos-chip-minuta').click()
  await page.getByTestId('tablero-proyectos-panel-minuta').waitFor({ state: 'hidden' })

  await ventasCard.getByTestId('tablero-proyectos-chip-analisis').click()
  const analisisPanel = page.getByTestId('tablero-proyectos-panel-analisis')
  await analisisPanel.getByText(/Iniciativa Alpha \(Viable\)/).waitFor()
  await page.screenshot({
    path: resolve(OUT, 'tablero-desarrollo-proyectos-analisis-panel.png'),
    fullPage: false,
  })
  console.log('PASS: panel Análisis con nombres de iniciativas')

  await ventasCard.getByTestId('tablero-proyectos-card-collapse').click()
  await ventasCard.getByTestId('tablero-proyectos-card-expand').waitFor({ timeout: 10_000 })
  await ventasCard.getByTestId('tablero-proyectos-card-expand').click()
  await ventasCard.getByTestId('tablero-proyectos-card-collapse').waitFor({ timeout: 10_000 })

  const refetchPromise = page.waitForResponse((r) => r.url().includes('tablero-proyectos') && r.ok())
  await page.getByTestId('tablero-proyectos-refresh').click()
  await refetchPromise
  console.log('PASS: botón Actualizar dispara refetch')

  await page.getByTestId('tablero-proyectos-section-finalizados').click()
  await page.getByTestId('tablero-proyectos-seccion-finalizados').waitFor()
  await page.getByTestId('tablero-proyectos-seccion-en-curso').waitFor({ state: 'hidden' })
  await page.screenshot({
    path: resolve(OUT, 'tablero-desarrollo-proyectos-filtro-finalizados.png'),
    fullPage: true,
  })
  console.log('PASS: filtro de sección Finalizados')

  await page.getByTestId('tablero-proyectos-section-en-curso').click()
  await page.screenshot({
    path: resolve(OUT, 'tablero-desarrollo-proyectos-con-acceso.png'),
    fullPage: true,
  })
  console.log('PASS: usuario con boardAccess ve el tablero')

  const deniedContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const deniedPage = await deniedContext.newPage()
  const deniedToken = await getAuth().createCustomToken(deniedRecord.uid)
  await deniedPage.goto(`${VITE}/intranet`, { waitUntil: 'domcontentloaded' })
  await deniedPage.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function')
  await deniedPage.evaluate(async (t) => window.__e2eSignInWithCustomToken(t), deniedToken)
  await deniedPage.getByText('Sesión activa').waitFor({ timeout: 60_000 })

  await deniedPage.goto(`${VITE}/tableros/desarrollo-proyectos`, { waitUntil: 'domcontentloaded' })
  await deniedPage.getByTestId('tablero-proyectos-access-denied').waitFor({ timeout: 60_000 })
  await deniedPage.screenshot({
    path: resolve(OUT, 'tablero-desarrollo-proyectos-sin-acceso.png'),
    fullPage: true,
  })
  console.log('PASS: usuario sin boardAccess bloqueado')

  await deniedContext.close()
  await browser.close()
} finally {
  vite.kill('SIGTERM')
  server.close()
  for (const id of ticketIds) {
    await deleteHelpdeskTicketFull(id)
  }
  await revokeBoardAccess({
    boardFolderId,
    boardName: 'Desarrollo · Proyectos',
    granteeUid: actor.uid,
    actor,
  }).catch(() => {})
  await getAuth().deleteUser(deniedRecord.uid).catch(() => {})
  await db.collection('users').doc(deniedRecord.uid).delete().catch(() => {})
}
