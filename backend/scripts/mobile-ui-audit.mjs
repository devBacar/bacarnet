/**
 * Auditoría mobile (~390px) — capturas + detección de overflow horizontal.
 *   node backend/scripts/mobile-ui-audit.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, devices } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { generateEphemeralPassword } from './lib/testSecrets.mjs'
import { getAdminDb, getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const BASE = process.env.INTRANET_BASE?.trim() || 'https://bacarnet.web.app'
const OUT_DIR = join(process.cwd(), 'mobile-audit-screenshots')
const SAMPLE_FILE_ID =
  process.env.MOBILE_AUDIT_FILE_ID?.trim() || '11wsnXEQbrTYsK3pLDs_oazKSsp1koShC'

async function setTemporaryPassword(uid) {
  const tempPassword = generateEphemeralPassword()
  await getAuth().updateUser(uid, { password: tempPassword })
  return tempPassword
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body
    const overflowX = Math.max(doc.scrollWidth, body?.scrollWidth ?? 0) - doc.clientWidth
    return {
      scrollWidth: Math.max(doc.scrollWidth, body?.scrollWidth ?? 0),
      clientWidth: doc.clientWidth,
      overflowPx: Math.max(0, Math.round(overflowX)),
    }
  })
}

async function snap(page, name, notes = '') {
  const path = join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path, fullPage: true })
  const overflow = await measureOverflow(page)
  return { name, path, overflow, notes }
}

async function login(page, email, password) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('***REMOVED***login-email').fill(email)
  await page.locator('***REMOVED***login-password').fill(password)
  await page
    .locator('form')
    .filter({ has: page.locator('***REMOVED***login-email') })
    .getByRole('button', { name: /^iniciar sesión$/i })
    .click()
  await page.waitForURL(/\/(intranet|$)/, { timeout: 60000 })
  await page.waitForTimeout(1200)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const admin = await getTestIdToken()
  const password = await setTemporaryPassword(admin.uid)

  const iphone = devices['iPhone 13']
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    ...iphone,
    locale: 'es-AR',
  })
  const page = await context.newPage()
  page.setDefaultTimeout(45000)
  page.setDefaultNavigationTimeout(60000)

  const findings = []
  const errors = []

  async function step(fn) {
    try {
      await fn()
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  try {
    await step(async () => {
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      findings.push(await snap(page, '01-login', 'Pantalla de acceso'))
    })

    await step(async () => {
      await login(page, admin.email, password)
      findings.push(await snap(page, '02-post-login', 'Tras login'))
    })

    await step(async () => {
      if (!page.url().includes('/intranet')) {
        await page.goto(`${BASE}/intranet`, { waitUntil: 'load', timeout: 60000 })
      }
      await page.waitForTimeout(1200)
      findings.push(await snap(page, '03-intranet-home', 'Home con widgets'))
    })

    await step(async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
      await page.waitForTimeout(400)
      findings.push(await snap(page, '04-intranet-home-mid', 'Home scroll medio'))
    })

    await step(async () => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(400)
      findings.push(await snap(page, '05-intranet-home-bottom', 'Home scroll inferior'))
    })

    await step(async () => {
      await page.goto(`${BASE}/recursos`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(1200)
      findings.push(await snap(page, '06-archivos-lista', 'Explorador vista lista'))
    })

    await step(async () => {
      const filterBtn = page.getByRole('button', { name: /filtros/i })
      if (await filterBtn.count()) {
        await filterBtn.first().click()
        await page.waitForTimeout(400)
        findings.push(await snap(page, '07-archivos-filtros', 'Panel filtros abierto'))
      }
    })

    await step(async () => {
      const gridBtn = page.getByRole('button', { name: /Vista de cuadrícula/i })
      if (await gridBtn.count()) {
        await gridBtn.first().click()
        await page.waitForTimeout(500)
        findings.push(await snap(page, '08-archivos-grilla', 'Explorador vista grilla'))
      }
    })

    await step(async () => {
      await page.goto(`${BASE}/recursos/documento/${SAMPLE_FILE_ID}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      })
      await page.waitForTimeout(2000)
      findings.push(await snap(page, '09-documento-visor', `Visor embebido ${SAMPLE_FILE_ID}`))
    })

    await step(async () => {
      await page.goto(`${BASE}/tableros`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(1000)
      findings.push(await snap(page, '10-tableros-lista', 'Listado tableros'))
    })

    await step(async () => {
      const boardLink = page.locator('a[href*="/tableros/"]').first()
      if (await boardLink.count()) {
        const href = await boardLink.getAttribute('href')
        if (href) {
          await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
          await page.waitForTimeout(2500)
          findings.push(await snap(page, '11-tablero-fullscreen', `Tablero ${href}`))
        }
      }
    })

    await step(async () => {
      await page.goto(`${BASE}/intranet`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      const bell = page.getByRole('button', { name: /notificaciones/i })
      if (await bell.count()) {
        await bell.first().click()
        await page.waitForTimeout(500)
        findings.push(await snap(page, '12-notificaciones-dropdown', 'Dropdown campanita'))
      }
    })

    await step(async () => {
      await page.goto(`${BASE}/recursos`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(1000)
      const permBtn = page.getByRole('button', { name: /Permisos de/i }).first()
      if (await permBtn.count()) {
        await permBtn.click({ force: true })
        await page.waitForTimeout(1200)
        findings.push(await snap(page, '13-permisos-modal', 'Modal permisos'))
      }
    })

    await step(async () => {
      await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(1000)
      findings.push(await snap(page, '14-admin-dashboard', 'Panel admin'))
    })

    await step(async () => {
      await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(1000)
      findings.push(await snap(page, '15-admin-users', 'Admin usuarios'))
    })

    await step(async () => {
      await page.goto(`${BASE}/ayuda`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(600)
      findings.push(await snap(page, '16-ayuda', 'Centro de ayuda'))
    })
  } finally {
    await browser.close()
  }

  const report = {
    viewport: 'iPhone 13 (390×844)',
    baseUrl: BASE,
    capturedAt: new Date().toISOString(),
    errors,
    findings: findings.map((f) => ({
      ...f,
      path: f.path.replace(/\\/g, '/'),
    })),
    overflowIssues: findings.filter((f) => f.overflow.overflowPx > 2),
  }

  await writeFile(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report, null, 2))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
