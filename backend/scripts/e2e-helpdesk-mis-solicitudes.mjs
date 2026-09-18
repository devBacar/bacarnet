/**
 * E2E autenticado /mis-solicitudes-sistemas (Playwright).
 *
 *   npm --prefix backend run build
 *   node backend/scripts/e2e-helpdesk-mis-solicitudes.mjs
 */

import { spawn } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getTestIdToken, initAdmin, getAdminDb, loadTestEnv } from './get-test-token.mjs'
import { deleteHelpdeskTicketFull } from './helpdesk-e2e-cleanup.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(SCRIPT_DIR, 'output')
const SCREENSHOT_COLLAPSED = resolve(OUTPUT_DIR, 'mis-solicitudes-colapsado.png')
const SCREENSHOT_EXPANDED = resolve(OUTPUT_DIR, 'mis-solicitudes-expandido.png')

const VITE_PORT = Number(process.env.E2E_VITE_PORT ?? 5174)
const API_PORT = Number(process.env.HELPDESK_TEST_PORT ?? 8799)
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`

const E2E_AREA_MEDIA = 'E2E Mis Solicitudes Media'
const E2E_AREA_ALTA = 'E2E Mis Solicitudes Urgente'
const E2E_AREA_FINAL = 'E2E Mis Solicitudes Finalizado'
const E2E_AREA_BITACORA = 'E2E Mis Solicitudes Bitácora'
const E2E_REUNION_TIPO = 'Reunión inicial E2E'
const E2E_BITACORA_COMMENT = `Comentario E2E bitácora ${Date.now()}`
const SCREENSHOT_BITACORA_MIS = resolve(OUTPUT_DIR, 'mis-solicitudes-bitacora-comentario.png')
const SCREENSHOT_BITACORA_MESA = resolve(OUTPUT_DIR, 'mis-solicitudes-bitacora-mesa.png')
const SCREENSHOT_ATTACH_VACIO = resolve(OUTPUT_DIR, 'bitacora-adjunto-1-vacio.png')
const SCREENSHOT_ATTACH_HOVER = resolve(OUTPUT_DIR, 'bitacora-adjunto-2-hover.png')
const SCREENSHOT_ATTACH_SELECCIONADO = resolve(OUTPUT_DIR, 'bitacora-adjunto-3-archivo-elegido.png')
const MIN_PNG_ATTACH = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const results = []
const sessionTicketIds = new Set()
let sessionRequesterUid = null

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
      env: {
        ...process.env,
        VITE_API_BASE_URL: API_ORIGIN,
        HELPDESK_TEST_PORT: String(API_PORT),
        VITE_E2E: 'true',
      },
      stdio: 'ignore',
      shell: true,
    },
  )
  await waitForHttpOk(VITE_ORIGIN, 120_000)
  console.log(`Vite E2E en ${VITE_ORIGIN} → API ${API_ORIGIN}`)
  return child
}

async function seedTicketsForUser({ uid, email, assigneeId, assigneeNombre }) {
  initAdmin()
  const db = getAdminDb()

  async function createTicket(partial) {
    const ticketRef = db.collection('helpdeskTickets').doc()
    sessionTicketIds.add(ticketRef.id)
    await ticketRef.set({
      token: `e2e-mis-${ticketRef.id.slice(0, 6)}`,
      requesterUid: uid,
      requesterEmail: email,
      requesterNombre: 'E2E Mis Solicitudes',
      areaId: 'test-area-e2e',
      areaNombre: partial.areaNombre,
      problematica: partial.problematica,
      urgencia: partial.urgencia,
      estadoIdx: partial.estadoIdx,
      asignadoATeamId: assigneeId,
      cancelado: partial.cancelado ?? false,
      createdAt: partial.createdAt ?? FieldValue.serverTimestamp(),
    })
    if (partial.reunion) {
      await ticketRef.collection('reuniones').doc().set({
        tipo: E2E_REUNION_TIPO,
        fecha: '15/09/2026',
        hora: '10:00',
        conTeamId: assigneeId,
        participantesTeamIds: [],
        estado: 'pendiente',
        createdAt: Timestamp.fromDate(new Date('2026-09-10T10:00:00Z')),
        ...(partial.reunionMinuta ? { minuta: partial.reunionMinuta } : {}),
      })
    }
    return ticketRef.id
  }

  const older = new Date('2026-08-01T10:00:00Z')
  const mediaId = await createTicket({
    areaNombre: E2E_AREA_MEDIA,
    problematica: 'Proyecto media sin urgencia — E2E',
    urgencia: 'media',
    estadoIdx: 1,
    createdAt: Timestamp.fromDate(older),
    reunion: true,
  })

  const altaId = await createTicket({
    areaNombre: E2E_AREA_ALTA,
    problematica: 'Proyecto urgente único — E2E',
    urgencia: 'alta',
    estadoIdx: 2,
    createdAt: Timestamp.fromDate(new Date('2026-09-14T10:00:00Z')),
    reunion: true,
    reunionMinuta: {
      texto: 'Minuta E2E visible al expandir',
      autorNombre: assigneeNombre,
      updatedAt: Timestamp.fromDate(new Date('2026-09-15T12:00:00Z')),
    },
  })

  const finalId = await createTicket({
    areaNombre: E2E_AREA_FINAL,
    problematica: 'Proyecto finalizado — E2E',
    urgencia: 'baja',
    estadoIdx: 5,
    reunion: false,
  })

  const bitacoraId = await createTicket({
    areaNombre: E2E_AREA_BITACORA,
    problematica: 'Proyecto en desarrollo — comentario con imagen E2E',
    urgencia: 'media',
    estadoIdx: 4,
    createdAt: Timestamp.fromDate(new Date('2026-09-01T10:00:00Z')),
    reunion: false,
  })

  return { mediaId, altaId, finalId, bitacoraId, assigneeNombre }
}

async function cleanupSessionTickets() {
  if (sessionTicketIds.size === 0) {
    record('Limpieza ticket E2E', false, 'sin ticketId en sesión')
  } else {
    let allOk = true
    for (const id of sessionTicketIds) {
      const ok = await deleteHelpdeskTicketFull(id)
      if (!ok) allOk = false
    }
    sessionTicketIds.clear()
    record('Limpieza ticket E2E', allOk)
  }
  if (sessionRequesterUid) {
    const auth = getAuth()
    await auth.deleteUser(sessionRequesterUid).catch(() => {})
    await getAdminDb().collection('users').doc(sessionRequesterUid).delete().catch(() => {})
    sessionRequesterUid = null
  }
}

async function createE2eRequesterUser() {
  initAdmin()
  const auth = getAuth()
  const db = getAdminDb()
  const email = `e2e.mis.solicitudes+${Date.now()}@bacarsa.com.ar`
  const created = await auth.createUser({ email, emailVerified: true })
  sessionRequesterUid = created.uid
  await db.collection('users').doc(created.uid).set({
    email,
    displayName: 'E2E Mis Solicitudes',
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
  return { uid: created.uid, email }
}

async function signInWithCustomToken(page, uid) {
  const customToken = await getAuth().createCustomToken(uid)

  await page.goto(`${VITE_ORIGIN}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => typeof window.__e2eSignInWithCustomToken === 'function',
    { timeout: 120_000 },
  )
  await page.evaluate(async (token) => {
    await window.__e2eSignInWithCustomToken(token)
  }, customToken)
  await page.getByText(/sesión activa/i).waitFor({ timeout: 90_000 })
  await page.waitForFunction(
    async () => {
      if (typeof window.__getIdToken !== 'function') return false
      return Boolean(await window.__getIdToken())
    },
    { timeout: 30_000 },
  )
}

async function runPlaywright({ uid, teamUid, altaId, mediaId, bitacoraId, assigneeNombre }) {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  try {
    await signInWithCustomToken(page, uid)

    const apiResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/helpdesk/tickets/mias') &&
        res.request().method() === 'GET' &&
        res.status() !== 0,
      { timeout: 60_000 },
    )

    await page.goto(`${VITE_ORIGIN}/mis-solicitudes-sistemas`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    })

    const res = await apiResponse
    record('GET /api/helpdesk/tickets/mias responde 200', res.status() === 200, `status ${res.status()}`)

    await page.getByTestId('helpdesk-mis-proyectos-resumen').waitFor({ timeout: 30_000 })
    await page.getByText('Cargando proyectos…').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})

    const activosSection = page.getByTestId('helpdesk-mis-proyectos-seccion-activos')
    const activosRowCount = await activosSection.locator('[data-testid="helpdesk-mis-solicitud-row"]').count()
    const kpiActivosVal = await page
      .getByTestId('helpdesk-mis-proyectos-kpi-activos')
      .locator('p.tabular-nums')
      .innerText()
    record('KPI activos coincide con filas', Number(kpiActivosVal) === activosRowCount, `${kpiActivosVal} vs ${activosRowCount}`)
    record('Hay al menos 2 activos E2E', activosRowCount >= 2)
    const kpiUrgentesVal = await page
      .getByTestId('helpdesk-mis-proyectos-kpi-urgentes-activos')
      .locator('p.tabular-nums')
      .innerText()
    record('KPI urgentes activos >= 1', Number(kpiUrgentesVal) >= 1)
    const finalRowCount = await page
      .getByTestId('helpdesk-mis-proyectos-seccion-finalizados')
      .locator('[data-testid="helpdesk-mis-solicitud-row"]')
      .count()
    const kpiFinalVal = await page
      .getByTestId('helpdesk-mis-proyectos-kpi-finalizados')
      .locator('p.tabular-nums')
      .innerText()
    record('KPI finalizados coincide', Number(kpiFinalVal) === finalRowCount)

    const expandedActivos = activosSection.locator(
      '[data-testid="helpdesk-mis-solicitud-row"][aria-expanded="true"]',
    )
    record('Activos arrancan colapsados', (await expandedActivos.count()) === 0)

    const altaRow = page.locator(`[data-ticket-id="${altaId}"]`)
    await altaRow.getByTestId('helpdesk-mis-solicitud-row').waitFor()
    const altaExpanded = await altaRow.getByTestId('helpdesk-mis-solicitud-row').getAttribute('aria-expanded')
    record('Urgente arranca colapsado', altaExpanded === 'false', E2E_AREA_ALTA)

    const mediaRow = page.locator(`[data-ticket-id="${mediaId}"]`)
    const mediaExpanded = await mediaRow.getByTestId('helpdesk-mis-solicitud-row').getAttribute('aria-expanded')
    record('Proyecto media arranca colapsado', mediaExpanded === 'false')

    const finalSection = page.getByTestId('helpdesk-mis-proyectos-seccion-finalizados')
    const finalExpanded = await finalSection
      .locator('[data-testid="helpdesk-mis-solicitud-row"]')
      .first()
      .getAttribute('aria-expanded')
    record('Finalizados arrancan colapsados', finalExpanded === 'false')

    await page.screenshot({ path: SCREENSHOT_COLLAPSED, fullPage: true })
    record('Screenshot vista colapsada', existsSync(SCREENSHOT_COLLAPSED))

    await altaRow.getByTestId('helpdesk-mis-solicitud-row').click()
    await altaRow.getByTestId('helpdesk-mis-solicitud-expanded-body').waitFor({ timeout: 15_000 })
    await mediaRow.getByTestId('helpdesk-mis-solicitud-row').click()
    await mediaRow.getByTestId('helpdesk-mis-solicitud-expanded-body').waitFor({ timeout: 15_000 })
    const mediaText = await mediaRow.innerText()
    record('Expandir por click en fila media', mediaText.includes(E2E_AREA_MEDIA))
    record('Varios abiertos a la vez', (await expandedActivos.count()) >= 2)

    const minutaBody = altaRow.getByTestId('helpdesk-mis-proyectos-minuta-body')
    record('Minuta comprimida por defecto', !(await minutaBody.isVisible().catch(() => false)))
    await altaRow.getByTestId('helpdesk-mis-proyectos-minuta-toggle').click()
    await minutaBody.waitFor({ timeout: 10_000 })
    await page.screenshot({ path: SCREENSHOT_EXPANDED, fullPage: true })
    record('Screenshot proyecto expandido', existsSync(SCREENSHOT_EXPANDED))
    record('Minuta visible tras desplegar', (await altaRow.innerText()).includes('Minuta E2E'))
    record('Referente en detalle', (await mediaRow.innerText()).includes(assigneeNombre))

    const bitacoraRow = page.locator(`[data-ticket-id="${bitacoraId}"]`)
    await bitacoraRow.getByTestId('helpdesk-mis-solicitud-row').click()
    await bitacoraRow.getByTestId('helpdesk-mis-solicitud-expanded-body').waitFor({ timeout: 15_000 })
    record(
      'Selector adjunto estilizado junto al comentario',
      (await bitacoraRow.getByTestId('helpdesk-bitacora-file-trigger').count()) >= 1,
    )
    const attachTrigger = bitacoraRow.locator('[data-testid="helpdesk-bitacora-file-trigger"]')
    await attachTrigger.screenshot({ path: SCREENSHOT_ATTACH_VACIO })
    await attachTrigger.hover()
    await page.waitForTimeout(250)
    await attachTrigger.screenshot({ path: SCREENSHOT_ATTACH_HOVER })
    await bitacoraRow.getByTestId('helpdesk-bitacora-file').setInputFiles({
      name: 'informe-diagnostico-proyecto-sistemas-2026.png',
      mimeType: 'image/png',
      buffer: MIN_PNG_ATTACH,
    })
    await bitacoraRow.getByTestId('helpdesk-bitacora-file-selected').waitFor({ timeout: 10_000 })
    await bitacoraRow
      .locator('[data-testid="helpdesk-bitacora-file-selected"]')
      .screenshot({ path: SCREENSHOT_ATTACH_SELECCIONADO })
    record('Screenshots adjunto vacío / hover / seleccionado', existsSync(SCREENSHOT_ATTACH_SELECCIONADO))
    await bitacoraRow.getByTestId('helpdesk-bitacora-file-clear').click()
    await bitacoraRow.getByTestId('helpdesk-bitacora-file-trigger').waitFor({ timeout: 5_000 })

    await bitacoraRow.getByTestId('helpdesk-bitacora-texto').fill(E2E_BITACORA_COMMENT)
    const bitacoraPost = page.waitForResponse(
      (res) => res.url().includes('/bitacora') && res.request().method() === 'POST',
      { timeout: 30_000 },
    )
    await bitacoraRow.getByTestId('helpdesk-bitacora-publicar').click()
    const postRes = await bitacoraPost
    const postBody = await postRes.text()
    record('POST bitácora comentario', postRes.ok(), `${postRes.status()} ${postBody.slice(0, 120)}`)
    await bitacoraRow.getByText(E2E_BITACORA_COMMENT).waitFor({ timeout: 30_000 })
    record(
      'Comentario del solicitante en Mis proyectos',
      (await bitacoraRow
        .getByTestId('helpdesk-bitacora-feed')
        .locator('[data-bitacora-tipo="comentario"]')
        .filter({ hasText: E2E_BITACORA_COMMENT })
        .count()) >= 1,
    )
    await page.screenshot({ path: SCREENSHOT_BITACORA_MIS, fullPage: true })
    record('Screenshot comentario bitácora Mis proyectos', existsSync(SCREENSHOT_BITACORA_MIS))

    await signInWithCustomToken(page, teamUid)
    await page.goto(`${VITE_ORIGIN}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 60_000 })
    await page
      .getByTestId('helpdesk-mesa-ticket-row')
      .filter({ hasText: E2E_AREA_BITACORA })
      .first()
      .click()
    await page.getByTestId('helpdesk-mesa-detail').waitFor({ timeout: 30_000 })
    await page.getByTestId('helpdesk-mesa-bitacora-toggle').click()
    await page.getByText(E2E_BITACORA_COMMENT).waitFor({ timeout: 30_000 })
    record(
      'Comentario visible en mesa Sistemas',
      (await page
        .getByTestId('helpdesk-bitacora-feed')
        .locator('[data-bitacora-tipo="comentario"]')
        .filter({ hasText: E2E_BITACORA_COMMENT })
        .count()) >= 1,
    )
    await page.screenshot({ path: SCREENSHOT_BITACORA_MESA, fullPage: true })
    record('Screenshot comentario bitácora mesa', existsSync(SCREENSHOT_BITACORA_MESA))
  } catch (err) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
    await page
      .screenshot({ path: resolve(OUTPUT_DIR, 'mis-solicitudes-e2e-failure.png'), fullPage: true })
      .catch(() => {})
    throw err
  } finally {
    await browser.close()
  }
}

async function main() {
  loadTestEnv()

  let backendServer = null
  let viteProcess = null

  try {
    backendServer = await ensureBackendListening()
    viteProcess = await ensureViteDev()

    const { uid, email } = await createE2eRequesterUser()
    const { uid: teamUid } = await getTestIdToken()
    initAdmin()
    const db = getAdminDb()
    const teamSnap = await db.collection('helpdeskTeam').where('activo', '==', true).limit(1).get()
    if (teamSnap.empty) throw new Error('No hay helpdeskTeam activo')
    const assigneeDoc = teamSnap.docs[0]
    const assigneeId = assigneeDoc.id
    const assigneeNombre = assigneeDoc.get('nombre') ?? 'Referente Sistemas'

    const { altaId, mediaId, bitacoraId } = await seedTicketsForUser({
      uid,
      email,
      assigneeId,
      assigneeNombre,
    })
    await runPlaywright({ uid, teamUid, altaId, mediaId, bitacoraId, assigneeNombre })
  } catch (err) {
    console.error('\nError E2E:', err)
    record('Ejecución E2E', false, err instanceof Error ? err.message : String(err))
  } finally {
    try {
      await cleanupSessionTickets()
    } catch (cleanupErr) {
      record('Limpieza ticket E2E', false, String(cleanupErr))
    }
    if (viteProcess && !viteProcess.killed) viteProcess.kill('SIGTERM')
    if (backendServer) await new Promise((r) => backendServer.close(r))
  }

  console.log('\n=== Resumen E2E /mis-solicitudes-sistemas ===')
  for (const row of results) {
    console.log(`${row.ok ? '✅' : '❌'} ${row.label}${row.detail ? ` — ${row.detail}` : ''}`)
  }
  process.exit(results.some((r) => !r.ok) ? 1 : 0)
}

main()
