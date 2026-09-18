/**

 * Verificación prod bacarnet.web.app — Mis proyectos (colapsado + bitácora comentario con adjunto).

 *

 *   node backend/scripts/prod-verify-mis-proyectos.mjs

 */

import { mkdirSync } from 'node:fs'

import { dirname, resolve } from 'node:path'

import { fileURLToPath } from 'node:url'

import { Timestamp } from 'firebase-admin/firestore'

import { getAuth } from 'firebase-admin/auth'

import { chromium } from 'playwright'

import { deleteHelpdeskTicketFull } from './helpdesk-e2e-cleanup.mjs'

import { generateEphemeralPassword } from './lib/testSecrets.mjs'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'



const PROD_APP = 'https://bacarnet.web.app'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output/prod-mis-proyectos')



const E2E_AREA_MEDIA = 'Prueba Prod Mis Proyectos Media'

const E2E_AREA_ALTA = 'Prueba Prod Mis Proyectos Urgente'

const E2E_AREA_BITACORA = 'Prueba Prod Mis Proyectos Bitácora'

const E2E_BITACORA_COMMENT = `Comentario prod adjunto ${Date.now()}`



const MIN_PNG = Buffer.from(

  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',

  'base64',

)



loadTestEnv()

initAdmin()



const auth = getAuth()

const db = getAdminDb()



const testEmail = `prueba.mis.proyectos+${Date.now()}@bacarsa.com.ar`

const testPassword = generateEphemeralPassword()

const ticketIds = []



const testUser = await auth.createUser({

  email: testEmail,

  password: testPassword,

  emailVerified: true,

})

await db.collection('users').doc(testUser.uid).set({

  email: testEmail,

  displayName: 'Prueba Mis Proyectos Prod',

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



const teamSnap = await db.collection('helpdeskTeam').where('activo', '==', true).limit(1).get()

if (teamSnap.empty) throw new Error('No hay helpdeskTeam activo en prod')

const assigneeId = teamSnap.docs[0].id



async function seedTicket(partial) {

  const ref = db.collection('helpdeskTickets').doc()

  ticketIds.push(ref.id)

  await ref.set({

    token: `prod-mis-${ref.id.slice(0, 6)}`,

    requesterUid: testUser.uid,

    requesterEmail: testEmail,

    requesterNombre: 'Prueba Mis Proyectos Prod',

    areaId: 'prod-mis-proyectos',

    areaNombre: partial.areaNombre,

    problematica: partial.problematica,

    urgencia: partial.urgencia,

    estadoIdx: partial.estadoIdx,

    asignadoATeamId: assigneeId,

    cancelado: partial.cancelado ?? false,

    createdAt: partial.createdAt ?? Timestamp.now(),

  })

  if (partial.reunion) {

    await ref.collection('reuniones').doc().set({

      tipo: 'Reunión inicial',

      fecha: '15/09/2026',

      hora: '10:00',

      conTeamId: assigneeId,

      participantesTeamIds: [],

      estado: 'confirmada',

      createdAt: Timestamp.fromDate(new Date('2026-09-10T10:00:00Z')),

      ...(partial.reunionMinuta ? { minuta: partial.reunionMinuta } : {}),

    })

  }

  return ref.id

}



const mediaId = await seedTicket({

  areaNombre: E2E_AREA_MEDIA,

  problematica: 'Ticket prueba prod media',

  urgencia: 'media',

  estadoIdx: 1,

  createdAt: Timestamp.fromDate(new Date('2026-08-01T10:00:00Z')),

  reunion: true,

})

const altaId = await seedTicket({

  areaNombre: E2E_AREA_ALTA,

  problematica: 'Ticket prueba prod urgente único',

  urgencia: 'alta',

  estadoIdx: 2,

  createdAt: Timestamp.fromDate(new Date('2026-09-14T10:00:00Z')),

  reunion: true,

  reunionMinuta: {

    texto: 'Minuta prod comprimida — expandir para leer completa',

    autorNombre: 'Prueba Prod',

    updatedAt: Timestamp.fromDate(new Date('2026-09-15T12:00:00Z')),

  },

})

const bitacoraId = await seedTicket({

  areaNombre: E2E_AREA_BITACORA,

  problematica: 'Ticket prod bitácora comentario adjunto',

  urgencia: 'media',

  estadoIdx: 4,

  createdAt: Timestamp.fromDate(new Date('2026-09-01T10:00:00Z')),

})

await seedTicket({

  areaNombre: 'Prueba Prod Mis Proyectos Finalizado',

  problematica: 'Ticket finalizado prod',

  urgencia: 'baja',

  estadoIdx: 5,

})



async function signInPassword(page, email, password) {

  const apiKey = process.env.VITE_FIREBASE_API_KEY?.trim()

  if (!apiKey) throw new Error('Falta VITE_FIREBASE_API_KEY')

  await page.goto(`${PROD_APP}/`, { waitUntil: 'domcontentloaded' })

  await page.locator('#login-email').fill(email)

  await page.locator('#login-password').fill(password)

  await page

    .locator('form')

    .filter({ has: page.locator('#login-email') })

    .getByRole('button', { name: /^iniciar sesión$/i })

    .click()

  await page.getByText(/Sesión activa|¡Hola,/i).first().waitFor({ timeout: 90_000 })

}



async function verifyBitacoraViaApi({ ticketId, commentText, idToken }) {
  const res = await fetch(
    `${PROD_APP}/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/bitacora`,
    { headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json' } },
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`GET bitácora prod falló: ${res.status} ${JSON.stringify(body)}`)
  }
  const match = body.entradas?.find(
    (e) =>
      e.tipo === 'comentario' &&
      String(e.texto).includes(commentText) &&
      Boolean(e.adjuntoDriveLink),
  )
  if (!match) {
    throw new Error(`Bitácora API sin comentario con adjunto: ${JSON.stringify(body).slice(0, 400)}`)
  }
  console.log('PASS prod: comentario con adjunto vía API (mesa)')
}



try {

  mkdirSync(OUT, { recursive: true })



  const browser = await chromium.launch({ headless: true })

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })



  await signInPassword(page, testEmail, testPassword)



  await page.goto(`${PROD_APP}/mis-solicitudes-sistemas`, { waitUntil: 'domcontentloaded' })

  await page.getByTestId('helpdesk-mis-proyectos-resumen').waitFor({ timeout: 90_000 })

  await page.getByText('Cargando proyectos…').waitFor({ state: 'hidden', timeout: 120_000 })



  const activosSection = page.getByTestId('helpdesk-mis-proyectos-seccion-activos')

  const activosRows = await activosSection.locator('[data-testid="helpdesk-mis-solicitud-row"]').count()

  const kpiActivos = await page

    .getByTestId('helpdesk-mis-proyectos-kpi-activos')

    .locator('p.tabular-nums')

    .innerText()

  if (Number(kpiActivos) !== activosRows) {

    throw new Error(`KPI activos ${kpiActivos} !== filas ${activosRows}`)

  }

  console.log('PASS prod: KPI activos coincide con filas', kpiActivos)



  const expandedCount = await activosSection

    .locator('[data-testid="helpdesk-mis-solicitud-row"][aria-expanded="true"]')

    .count()

  if (expandedCount !== 0) {

    throw new Error(`Se esperaban 0 expandidos al cargar, hay ${expandedCount}`)

  }

  console.log('PASS prod: todos los activos colapsados al cargar')



  const altaExpanded = await page

    .locator(`[data-ticket-id="${altaId}"]`)

    .getByTestId('helpdesk-mis-solicitud-row')

    .getAttribute('aria-expanded')

  if (altaExpanded !== 'false') {

    throw new Error('El urgente debería arrancar colapsado')

  }



  await page.screenshot({

    path: resolve(OUT, 'prod-mis-proyectos-colapsado.png'),

    fullPage: true,

  })



  await page.locator(`[data-ticket-id="${altaId}"]`).getByTestId('helpdesk-mis-solicitud-row').click()

  await page

    .locator(`[data-ticket-id="${altaId}"]`)

    .getByTestId('helpdesk-mis-solicitud-expanded-body')

    .waitFor({ timeout: 15_000 })

  await page.screenshot({

    path: resolve(OUT, 'prod-mis-proyectos-expandido.png'),

    fullPage: true,

  })

  console.log('PASS prod: capturas colapsado + expandido manual')



  const altaRow = page.locator(`[data-ticket-id="${altaId}"]`)

  const minutaBody = altaRow.getByTestId('helpdesk-mis-proyectos-minuta-body')

  if (await minutaBody.isVisible().catch(() => false)) {

    throw new Error('Minuta debería estar comprimida por defecto')

  }

  await altaRow.getByTestId('helpdesk-mis-proyectos-minuta-toggle').click()

  await minutaBody.waitFor({ timeout: 15_000 })

  const minutaText = await altaRow.innerText()

  if (!minutaText.includes('Minuta prod comprimida')) {

    throw new Error('Minuta no se desplegó correctamente')

  }

  console.log('PASS prod: minuta comprimida y desplegable')



  await page.locator(`[data-ticket-id="${mediaId}"]`).getByTestId('helpdesk-mis-solicitud-row').click()

  await page

    .locator(`[data-ticket-id="${mediaId}"]`)

    .getByTestId('helpdesk-mis-solicitud-expanded-body')

    .waitFor({ timeout: 15_000 })



  await page.locator(`[data-ticket-id="${mediaId}"]`).getByTestId('helpdesk-mis-solicitud-row').click()

  await page

    .locator(`[data-ticket-id="${mediaId}"]`)

    .getByTestId('helpdesk-mis-solicitud-expanded-body')

    .waitFor({ state: 'hidden', timeout: 15_000 })

  console.log('PASS prod: expandir/colapsar por click en fila')



  const bitacoraRow = page.locator(`[data-ticket-id="${bitacoraId}"]`)

  await bitacoraRow.getByTestId('helpdesk-mis-solicitud-row').click()

  await bitacoraRow.getByTestId('helpdesk-mis-solicitud-expanded-body').waitFor({ timeout: 15_000 })

  await bitacoraRow.getByTestId('helpdesk-bitacora-texto').fill(E2E_BITACORA_COMMENT)

  await bitacoraRow.getByTestId('helpdesk-bitacora-file').setInputFiles({

    name: 'prod-bitacora-comentario.png',

    mimeType: 'image/png',

    buffer: MIN_PNG,

  })

  const bitacoraPost = page.waitForResponse(
    (res) => res.url().includes('/bitacora') && res.request().method() === 'POST',
    { timeout: 120_000 },
  )
  await bitacoraRow.getByTestId('helpdesk-bitacora-publicar').click()
  const postRes = await bitacoraPost
  const postJson = await postRes.json().catch(() => ({}))
  console.log('POST bitácora prod', postRes.status(), JSON.stringify(postJson).slice(0, 300))
  if (!postRes.ok()) {
    throw new Error(`POST bitácora falló: ${postRes.status()} ${JSON.stringify(postJson)}`)
  }

  await bitacoraRow.getByText(E2E_BITACORA_COMMENT).waitFor({ timeout: 90_000 })

  const misAdjunto = bitacoraRow

    .getByTestId('helpdesk-bitacora-feed')

    .locator('[data-bitacora-tipo="comentario"]')

    .filter({ hasText: E2E_BITACORA_COMMENT })

    .getByRole('link', { name: /ver adjunto/i })

  if ((await misAdjunto.count()) < 1) {

    throw new Error('Comentario sin enlace Ver adjunto en Mis proyectos')

  }

  await page.screenshot({

    path: resolve(OUT, 'prod-mis-proyectos-bitacora-comentario.png'),

    fullPage: true,

  })

  console.log('PASS prod: comentario con imagen en Mis proyectos')



  const { email: teamEmail, idToken: teamToken } = await getTestIdToken()
  await verifyBitacoraViaApi({ ticketId: bitacoraId, commentText: E2E_BITACORA_COMMENT, idToken: teamToken })

  const teamPassword =
    process.env.CHECK_PASSWORD?.trim() || process.env.TEST_ACCOUNT_PASSWORD?.trim()
  if (teamPassword) {
    await signInPassword(page, teamEmail, teamPassword)
    await page.goto(`${PROD_APP}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 90_000 })
    await page
      .getByTestId('helpdesk-mesa-ticket-row')
      .filter({ hasText: E2E_AREA_BITACORA })
      .first()
      .click()
    await page.getByTestId('helpdesk-mesa-detail').waitFor({ timeout: 30_000 })
    await page.getByTestId('helpdesk-mesa-bitacora-toggle').click()
    await page.getByText(E2E_BITACORA_COMMENT).waitFor({ timeout: 30_000 })
    const mesaAdjunto = page
      .getByTestId('helpdesk-bitacora-feed')
      .locator('[data-bitacora-tipo="comentario"]')
      .filter({ hasText: E2E_BITACORA_COMMENT })
      .getByRole('link', { name: /ver adjunto/i })
    if ((await mesaAdjunto.count()) < 1) {
      throw new Error('Comentario sin adjunto visible en mesa Sistemas')
    }
    await page.screenshot({
      path: resolve(OUT, 'prod-mis-proyectos-bitacora-mesa.png'),
      fullPage: true,
    })
    console.log('PASS prod: comentario con imagen en mesa Sistemas')
  } else {
    console.log(
      'SKIP prod: captura mesa (definí CHECK_PASSWORD o TEST_ACCOUNT_PASSWORD para login UI)',
    )
  }



  await browser.close()

  console.log('Verificación prod OK. Capturas en', OUT)

} finally {

  for (const id of ticketIds) {

    await deleteHelpdeskTicketFull(id).catch(() => {})

  }

  await auth.deleteUser(testUser.uid).catch(() => {})

  await db.collection('users').doc(testUser.uid).delete().catch(() => {})

}


