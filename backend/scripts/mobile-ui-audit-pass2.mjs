/**
 * Capturas mobile adicionales con waits explícitos.
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, devices } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { generateEphemeralPassword } from './lib/testSecrets.mjs'
import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
const BASE = process.env.INTRANET_BASE?.trim() || 'https://bacarnet.web.app'
const OUT = join(process.cwd(), 'mobile-audit-screenshots')

async function setTemporaryPassword(uid) {
  const tempPassword = generateEphemeralPassword()
  await getAuth().updateUser(uid, { password: tempPassword })
  return tempPassword
}

async function login(page, email, password) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('***REMOVED***login-email').fill(email)
  await page.locator('***REMOVED***login-password').fill(password)
  await page.locator('form').filter({ has: page.locator('***REMOVED***login-email') }).getByRole('button', { name: /^iniciar sesión$/i }).click()
  await Promise.race([
    page.waitForURL(/\/intranet/, { timeout: 60000 }),
    page.getByText(/Sesión activa|¡Hola,/i).first().waitFor({ timeout: 60000 }),
  ])
  if (!page.url().includes('/intranet')) {
    await page.goto(`${BASE}/intranet`, { waitUntil: 'load', timeout: 60000 })
  }
}

async function snap(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true })
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const admin = await getTestIdToken()
  const password = await setTemporaryPassword(admin.uid)
  const browser = await chromium.launch({ headless: true })
  const page = await (await browser.newContext({ ...devices['iPhone 13'], locale: 'es-AR' })).newPage()
  page.setDefaultTimeout(60000)

  await login(page, admin.email, password)
  await page.locator('text=¡Hola').first().waitFor({ timeout: 60000 })
  await snap(page, '03b-intranet-loaded')

  await page.goto(`${BASE}/recursos`, { waitUntil: 'domcontentloaded' })
  await page.getByText(/elementos · Google Drive|Cargando archivos|No encontramos archivos/i).first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(800)
  await snap(page, '06b-archivos-lista-loaded')

  await page.getByRole('button', { name: /^Filtros$/ }).click()
  await page.waitForTimeout(500)
  await snap(page, '07-archivos-filtros')

  await page.getByRole('button', { name: 'Vista de cuadrícula' }).click()
  await page.waitForTimeout(600)
  await snap(page, '08-archivos-grilla')

  await page.goto(`${BASE}/recursos/documento/11wsnXEQbrTYsK3pLDs_oazKSsp1koShC`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  await snap(page, '09b-documento-visor-loaded')

  await page.goto(`${BASE}/intranet`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /notificaciones/i }).click()
  await page.waitForTimeout(600)
  await snap(page, '12-notificaciones-dropdown')

  await page.goto(`${BASE}/recursos`, { waitUntil: 'domcontentloaded' })
  await page.getByText(/elementos · Google Drive/i).first().waitFor()
  const perm = page.locator('button[aria-label^="Permisos de"]').first()
  await perm.waitFor({ timeout: 30000 })
  await perm.click({ force: true })
  await page.getByRole('heading', { name: /Permisos|Acceso/i }).first().waitFor({ timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(800)
  await snap(page, '13-permisos-modal')

  await page.goto(`${BASE}/tableros`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const link = page.locator('a[href*="/tableros/"]').first()
  if (await link.count()) {
    await link.click()
    await page.waitForTimeout(4000)
    await snap(page, '11-tablero-fullscreen')
  }

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
