import { join } from 'node:path'
import { chromium, devices } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { generateEphemeralPassword } from './lib/testSecrets.mjs'
import { getTestIdToken, loadTestEnv } from './get-test-token.mjs'

loadTestEnv()
const BASE = process.env.INTRANET_BASE?.trim() || 'https://bacarnet.web.app'
const OUT = join(process.cwd(), 'mobile-audit-screenshots')

async function main() {
  const admin = await getTestIdToken()
  const pw = generateEphemeralPassword()
  await getAuth().updateUser(admin.uid, { password: pw })
  const browser = await chromium.launch({ headless: true })
  const page = await (await browser.newContext({ ...devices['iPhone 13'], locale: 'es-AR' })).newPage()
  page.setDefaultTimeout(90000)

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.locator('***REMOVED***login-email').fill(admin.email)
  await page.locator('***REMOVED***login-password').fill(pw)
  await page.locator('form').filter({ has: page.locator('***REMOVED***login-email') }).getByRole('button', { name: /^iniciar sesión$/i }).click()
  await Promise.race([
    page.waitForURL(/\/intranet/, { timeout: 90000 }),
    page.getByText(/Sesión activa|¡Hola,/i).first().waitFor({ timeout: 90000 }),
  ])
  if (!page.url().includes('/intranet')) {
    await page.goto(`${BASE}/intranet`, { waitUntil: 'load', timeout: 90000 })
  }

  await page.goto(`${BASE}/ayuda`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: join(OUT, '16c-ayuda-loaded.png'), fullPage: true })

  await page.goto(`${BASE}/tableros`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(10000)
  const links = await page.locator('a[href*="/tableros/"]').count()
  console.log('board links:', links)
  await page.screenshot({ path: join(OUT, '10c-tableros-loaded.png'), fullPage: true })
  if (links > 0) {
    await page.locator('a[href*="/tableros/"]').first().click()
    await page.waitForTimeout(10000)
    await page.screenshot({ path: join(OUT, '11d-tablero-fullscreen.png') })
  }

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
