/**
 * Capturas mobile complementarias: login, admin, tableros, archivos con datos, dropdown viewport.
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
  await page.locator('***REMOVED***login-email').waitFor({ timeout: 60000 })
  await snapViewport(page, '01b-login-form')
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

async function snapViewport(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`) })
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const offenders = []
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width < 8 || r.height < 8) continue
      if (r.right > vw + 2) {
        offenders.push({
          tag: el.tagName,
          cls: (el.className || '').toString().slice(0, 80),
          right: Math.round(r.right),
          vw,
          overflow: Math.round(r.right - vw),
        })
      }
    }
    offenders.sort((a, b) => b.overflow - a.overflow)
    return offenders.slice(0, 8)
  })
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const admin = await getTestIdToken()
  const password = await setTemporaryPassword(admin.uid)
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'es-AR' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)

  await login(page, admin.email, password)
  await page.locator('text=¡Hola').first().waitFor({ timeout: 60000 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await snapViewport(page, '03c-home-hero-viewport')

  await page.getByRole('button', { name: /notificaciones/i }).click()
  await page.waitForTimeout(400)
  await snapViewport(page, '12c-notificaciones-abierto')

  await page.goto(`${BASE}/recursos`, { waitUntil: 'domcontentloaded' })
  await page.getByText(/elementos · Google Drive/i).first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(1000)
  const overflowArchivos = await measureOverflow(page)
  await snap(page, '06c-archivos-carpeta-raiz')
  await snapViewport(page, '06d-archivos-viewport')

  await page.getByRole('button', { name: /^Filtros$/ }).click()
  await page.waitForTimeout(400)
  await snapViewport(page, '07b-filtros-viewport')
  const overflowFiltros = await measureOverflow(page)

  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: /Panel|Administración|Admin/i }).first().waitFor({ timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await snap(page, '14b-admin-dashboard-loaded')

  await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await snap(page, '15b-admin-users-loaded')

  await page.goto(`${BASE}/tableros`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await snap(page, '10b-tableros-lista-loaded')
  const link = page.locator('a[href*="/tableros/"]').first()
  if (await link.count()) {
    await link.click()
    await page.waitForTimeout(5000)
    await snapViewport(page, '11b-tablero-fullscreen-viewport')
    await snap(page, '11c-tablero-fullscreen')
  }

  await page.goto(`${BASE}/ayuda`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await snap(page, '16b-ayuda-loaded')

  const report = { overflowArchivos, overflowFiltros, viewport: 'iPhone 13 (390×844)' }
  await import('node:fs/promises').then((fs) =>
    fs.writeFile(join(OUT, 'report-pass3.json'), JSON.stringify(report, null, 2)),
  )

  await browser.close()
  console.log(JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
