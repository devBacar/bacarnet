/**
 * Verificación en bacarnet.web.app: acceso vía boardAccess (usuario de prueba, sin emails reales).
 *
 *   node backend/scripts/prod-verify-tablero-desarrollo-proyectos.mjs
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAuth } from 'firebase-admin/auth'
import { chromium } from 'playwright'
import { grantBoardAccess, revokeBoardAccess } from '../lib/modules/boards/boardAccess.js'
import { generateEphemeralPassword } from './lib/testSecrets.mjs'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

const PROD_APP = 'https://bacarnet.web.app'
const PROD_API =
  process.env.FUNCTIONS_API_BASE?.replace(/\/+$/, '') ||
  'https://southamerica-east1-bacar-web.cloudfunctions.net/api'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output/prod-tablero-desarrollo')

loadTestEnv()
initAdmin()

const boardFolderId = process.env.HELPDESK_BOARD_PROYECTOS_FOLDER_ID?.trim()
if (!boardFolderId) {
  throw new Error('Falta HELPDESK_BOARD_PROYECTOS_FOLDER_ID')
}

const actor = await getTestIdToken()
const testEmail = `prueba.tablero.prod+${Date.now()}@bacarsa.com.ar`
const testPassword = generateEphemeralPassword()
const auth = getAuth()
const db = getAdminDb()

const testUser = await auth.createUser({
  email: testEmail,
  password: testPassword,
  emailVerified: true,
})
await db.collection('users').doc(testUser.uid).set({
  email: testEmail,
  displayName: 'Prueba Tablero Prod',
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
  grantee: { uid: testUser.uid, email: testEmail, displayName: 'Prueba Tablero Prod' },
  actor,
})

async function signInPassword(email, password) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY?.trim()
  if (!apiKey) throw new Error('Falta VITE_FIREBASE_API_KEY')
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  )
  const body = await res.json()
  if (!res.ok) throw new Error(body.error?.message ?? 'signIn failed')
  return body.idToken
}

try {
  mkdirSync(OUT, { recursive: true })

  const allowedToken = await signInPassword(testEmail, testPassword)
  for (const [label, base] of [
    ['cloudfunctions', `${PROD_API}/api/helpdesk/tablero-proyectos`],
    ['hosting-rewrite', `${PROD_APP}/api/helpdesk/tablero-proyectos`],
  ]) {
    const apiOk = await fetch(base, {
      headers: { Authorization: `Bearer ${allowedToken}` },
    })
    const text = await apiOk.text()
    if (apiOk.status === 503 && text.includes('no configurado')) {
      throw new Error(
        `HELPDESK_BOARD_PROYECTOS_FOLDER_ID ausente en prod (${label}): ${text}`,
      )
    }
    if (!apiOk.ok) {
      throw new Error(`API ${label} con acceso ${apiOk.status} ${text}`)
    }
    const payload = JSON.parse(text)
    console.log(`API prod tickets (${label}):`, payload.tickets?.length ?? 0)
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto(`${PROD_APP}/`, { waitUntil: 'domcontentloaded' })
  await page.locator('#login-email').fill(testEmail)
  await page.locator('#login-password').fill(testPassword)
  await page
    .locator('form')
    .filter({ has: page.locator('#login-email') })
    .getByRole('button', { name: /^iniciar sesión$/i })
    .click()
  await page.getByText(/Sesión activa|¡Hola,/i).first().waitFor({ timeout: 90_000 })

  await page.goto(`${PROD_APP}/tableros/desarrollo-proyectos`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('tablero-desarrollo-proyectos-page').waitFor({ timeout: 90_000 })
  await page.getByText('Desarrollo · Proyectos').waitFor()
  await page.getByText('Cargando proyectos…').waitFor({ state: 'hidden', timeout: 120_000 })
  await page.getByTestId('tablero-proyectos-refresh').waitFor({ timeout: 30_000 })
  await page.getByTestId('tablero-proyectos-card-en-curso').first().waitFor({ timeout: 30_000 })

  const apiPayload = await fetch(`${PROD_APP}/api/helpdesk/tablero-proyectos`, {
    headers: { Authorization: `Bearer ${allowedToken}` },
  }).then((r) => r.json())
  const richRow =
    apiPayload.tickets?.find((t) => t.analisisResumen?.iniciativasResumen) ??
    apiPayload.tickets?.find((t) => t.minutaResumen)
  if (!richRow) throw new Error('Prod: ningún ticket con minuta/análisis para probar chips')

  const targetCard = page.locator(`[data-ticket-id="${richRow.ticketId}"]`)
  await targetCard.waitFor({ timeout: 30_000 })

  if (richRow.minutaResumen) {
    await targetCard.getByTestId('tablero-proyectos-chip-minuta').click()
    await page.getByTestId('tablero-proyectos-panel-minuta').waitFor({ timeout: 15_000 })
    await targetCard.getByTestId('tablero-proyectos-chip-minuta').click()
    await page.getByTestId('tablero-proyectos-panel-minuta').waitFor({ state: 'hidden' })
    console.log('PASS prod: chip Minuta expande/colapsa')
  }

  if (richRow.analisisResumen) {
    await targetCard.getByTestId('tablero-proyectos-chip-analisis').click()
    await page.getByTestId('tablero-proyectos-panel-analisis').waitFor({ timeout: 15_000 })
    await page.screenshot({
      path: resolve(OUT, 'prod-tablero-desarrollo-analisis-panel.png'),
      fullPage: false,
    })
    console.log('PASS prod: chip Análisis con contenido')
  }

  if (richRow.bitacoraResumen && (await targetCard.getByTestId('tablero-proyectos-chip-avances').count()) > 0) {
    await targetCard.getByTestId('tablero-proyectos-chip-avances').click()
    await page.getByTestId('tablero-proyectos-panel-avances').waitFor({ timeout: 15_000 })
    console.log('PASS prod: chip Avances')
  }

  await targetCard.getByTestId('tablero-proyectos-card-collapse').click()
  await targetCard.getByTestId('tablero-proyectos-card-expand').waitFor({ timeout: 10_000 })
  await targetCard.getByTestId('tablero-proyectos-card-expand').click()
  console.log('PASS prod: colapsar/expandir tarjeta')

  const refetchDone = page.waitForResponse(
    (r) => r.url().includes('tablero-proyectos') && r.status() === 200,
    { timeout: 120_000 },
  )
  await page.getByTestId('tablero-proyectos-refresh').click()
  await refetchDone
  console.log('PASS prod: botón Actualizar (refetch)')

  await page.getByTestId('tablero-proyectos-section-cancelados').click()
  await page.getByTestId('tablero-proyectos-seccion-cancelados').waitFor({ timeout: 15_000 })
  await page.getByTestId('tablero-proyectos-seccion-en-curso').waitFor({ state: 'hidden' })
  await page.screenshot({
    path: resolve(OUT, 'prod-tablero-desarrollo-filtro-seccion.png'),
    fullPage: true,
  })
  console.log('PASS prod: filtro de sección')

  await page.getByTestId('tablero-proyectos-section-en-curso').click()
  await page.screenshot({
    path: resolve(OUT, 'prod-tablero-desarrollo-con-acceso.png'),
    fullPage: true,
  })
  console.log('PASS UI prod: usuario de prueba con boardAccess')

  const deniedCtx = await browser.newContext()
  const deniedPage = await deniedCtx.newPage()
  const deniedEmail = `prueba.tablero.denegado+${Date.now()}@bacarsa.com.ar`
  const deniedPassword = generateEphemeralPassword()
  const deniedUser = await auth.createUser({
    email: deniedEmail,
    password: deniedPassword,
    emailVerified: true,
  })
  await db.collection('users').doc(deniedUser.uid).set({
    email: deniedEmail,
    displayName: 'Prueba Tablero Denegado',
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

  await deniedPage.goto(`${PROD_APP}/`, { waitUntil: 'domcontentloaded' })
  await deniedPage.locator('#login-email').fill(deniedEmail)
  await deniedPage.locator('#login-password').fill(deniedPassword)
  await deniedPage
    .locator('form')
    .filter({ has: deniedPage.locator('#login-email') })
    .getByRole('button', { name: /^iniciar sesión$/i })
    .click()
  await deniedPage.getByText(/Sesión activa|¡Hola,/i).first().waitFor({ timeout: 90_000 })

  const deniedToken = await signInPassword(deniedEmail, deniedPassword)
  const apiDenied = await fetch(`${PROD_API}/api/helpdesk/tablero-proyectos`, {
    headers: { Authorization: `Bearer ${deniedToken}` },
  })
  if (apiDenied.status !== 403) {
    throw new Error(`API sin acceso debería 403, got ${apiDenied.status}`)
  }

  await deniedPage.goto(`${PROD_APP}/tableros/desarrollo-proyectos`, { waitUntil: 'domcontentloaded' })
  await deniedPage.getByTestId('tablero-proyectos-access-denied').waitFor({ timeout: 90_000 })
  await deniedPage.screenshot({
    path: resolve(OUT, 'prod-tablero-desarrollo-sin-acceso.png'),
    fullPage: true,
  })
  console.log('PASS UI prod: usuario sin boardAccess bloqueado')

  await deniedCtx.close()
  await browser.close()

  await auth.deleteUser(deniedUser.uid)
  await db.collection('users').doc(deniedUser.uid).delete()
} finally {
  await revokeBoardAccess({
    boardFolderId,
    boardName: 'Desarrollo · Proyectos',
    granteeUid: testUser.uid,
    actor,
  }).catch(() => {})
  await auth.deleteUser(testUser.uid).catch(() => {})
  await db.collection('users').doc(testUser.uid).delete().catch(() => {})
}

console.log('Verificación prod OK. Capturas en', OUT)
