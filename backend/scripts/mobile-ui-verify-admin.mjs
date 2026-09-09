/**
 * Verificación mobile del panel admin (~390px).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, devices } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { generateEphemeralPassword } from './lib/testSecrets.mjs'
import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
const BASE = process.env.INTRANET_BASE?.trim() || 'https://bacarnet.web.app'
const OUT = join(process.cwd(), 'mobile-audit-screenshots', 'fixes-admin')

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
}

async function snap(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`) })
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    let count = 0
    let maxOverflow = 0
    const offenders = []
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width < 8) continue
      const overflow = r.right - vw
      if (overflow > 2) {
        count += 1
        maxOverflow = Math.max(maxOverflow, overflow)
        offenders.push({
          tag: el.tagName,
          cls: (el.className || '').toString().slice(0, 80),
          overflow: Math.round(overflow),
        })
      }
    }
    offenders.sort((a, b) => b.overflow - a.overflow)
    return { count, maxOverflow: Math.round(maxOverflow), vw, offenders: offenders.slice(0, 5) }
  })
}

async function openAdminDrawer(page) {
  const dialog = page.getByRole('dialog', { name: 'Menú del panel admin' })
  if (!(await dialog.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /abrir menú del panel admin/i }).click()
    await dialog.waitFor({ state: 'visible' })
  }
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
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: /^Dashboard$/ }).waitFor({ timeout: 60000 })

  report.overflow.dashboard = await measureOverflow(page)
  await snap(page, '01-admin-dashboard')

  await openAdminDrawer(page)
  await page.waitForTimeout(400)
  await snap(page, '02-admin-drawer-abierto')

  await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Usuarios registrados' }).waitFor({ timeout: 60000 })
  await page.locator('main li p.break-all').first().waitFor({ state: 'visible', timeout: 60000 })
  report.nav.users = page.url()
  report.overflow.users = await measureOverflow(page)
  await snap(page, '03-admin-users-loaded')

  await openAdminDrawer(page)
  await page.getByRole('link', { name: 'Auditoría' }).click()
  await page.waitForURL(/\/admin\/auditoria/, { timeout: 30000 })
  report.nav.auditoria = page.url()
  await snap(page, '04-admin-auditoria')

  await writeFile(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
