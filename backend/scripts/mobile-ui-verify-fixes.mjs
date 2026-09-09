/**
 * Verificación post-fix mobile (~390px) contra preview local o prod.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, devices } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { generateEphemeralPassword } from './lib/testSecrets.mjs'
import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
const BASE = process.env.INTRANET_BASE?.trim() || 'https://bacarnet.web.app'
const OUT = join(process.cwd(), 'mobile-audit-screenshots', 'fixes')

async function setTemporaryPassword(uid) {
  const tempPassword = generateEphemeralPassword()
  await getAuth().updateUser(uid, { password: tempPassword })
  return tempPassword
}

async function login(page, email, password) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('***REMOVED***login-email').waitFor({ timeout: 60000 })
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
  await page.screenshot({ path: join(OUT, `${name}.png`) })
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    let count = 0
    let maxOverflow = 0
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width < 8) continue
      const overflow = r.right - vw
      if (overflow > 2) {
        count += 1
        maxOverflow = Math.max(maxOverflow, overflow)
      }
    }
    return { count, maxOverflow: Math.round(maxOverflow), vw }
  })
}

async function openDrawer(page) {
  const dialog = page.getByRole('dialog', { name: 'Menú de navegación' })
  if (!(await dialog.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /abrir menú de navegación/i }).click()
    await dialog.waitFor({ state: 'visible' })
  }
}

async function navViaDrawer(page, label, pathPart) {
  await openDrawer(page)
  await page.getByRole('link', { name: label, exact: true }).click()
  await page.waitForURL(new RegExp(pathPart.replace('/', '\\/')), { timeout: 30000 })
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const admin = await getTestIdToken()
  const password = await setTemporaryPassword(admin.uid)
  const browser = await chromium.launch({ headless: true })
  const page = await (await browser.newContext({ ...devices['iPhone 13'], locale: 'es-AR' })).newPage()
  page.setDefaultTimeout(60000)
  const report = { base: BASE, nav: {}, overflow: {} }

  await login(page, admin.email, password)
  await page.locator('text=¡Hola').first().waitFor()

  await openDrawer(page)
  await page.waitForTimeout(400)
  await snap(page, '01-nav-drawer-abierto')

  for (const [label, pathPart] of [
    ['Archivos', '/recursos'],
    ['Tableros', '/tableros'],
    ['Ayuda', '/ayuda'],
  ]) {
    await navViaDrawer(page, label, pathPart)
    report.nav[label] = page.url()
    await page.waitForTimeout(800)
    await snap(page, `02-nav-${label.toLowerCase()}`)
  }

  await page.goto(`${BASE}/intranet`, { waitUntil: 'domcontentloaded' })
  await page.locator('text=¡Hola').first().waitFor()
  await snap(page, '03-home-hero')

  await page.goto(`${BASE}/recursos`, { waitUntil: 'domcontentloaded' })
  await page.getByText(/elementos · Google Drive/i).first().waitFor({ timeout: 60000 })
  report.overflow.archivosLista = await measureOverflow(page)
  await snap(page, '04-archivos-lista')

  await page.getByRole('button', { name: /^Filtros$/ }).click()
  await page.waitForTimeout(500)
  await snap(page, '05-archivos-filtros-sheet')
  report.overflow.archivosFiltros = await measureOverflow(page)
  await page.getByRole('button', { name: 'Cerrar panel de filtros' }).click()
  await page.waitForTimeout(300)

  await page.getByRole('tab', { name: 'Recientes' }).click()
  await page.waitForTimeout(400)
  await snap(page, '06-archivos-recientes-tab')

  await page.goto(`${BASE}/recursos/documento/11wsnXEQbrTYsK3pLDs_oazKSsp1koShC`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  await snap(page, '07-documento-visor')

  await writeFile(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
