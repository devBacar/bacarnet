/**
 * E2E: reordenar rotación de Sistemas en /admin/shifts
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUTPUT_DIR = resolve(ROOT, 'backend/scripts/output')
const SHOT = resolve(OUTPUT_DIR, 'turnos-orden-corregido.png')
const APP_ORIGIN = process.env.E2E_APP_ORIGIN ?? 'https://bacarnet.web.app'
const VITE_PORT = 5206
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`

let browser = null
let viteProcess = null

async function waitForHttp(url, timeoutMs = 120_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) })
      if (res.status < 500) return
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Timeout esperando ${url}`)
}

async function startVitePreview() {
  execFileSync(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'build'], {
    cwd: ROOT,
    env: {
      ...process.env,
      VITE_E2E: 'true',
      VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? 'https://bacarnet.web.app',
    },
    stdio: 'inherit',
  })
  viteProcess = spawn(
    process.execPath,
    [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        VITE_E2E: 'true',
        VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? 'https://bacarnet.web.app',
      },
      shell: false,
      stdio: 'inherit',
    },
  )
  await waitForHttp(VITE_ORIGIN)
}
let uid = null
let email = null
let originalConfig = null

async function readMemberOrder(page) {
  return page.locator('[data-testid^="rotation-member-"] [data-testid="rotation-member-name"]').allTextContents()
}

async function main() {
  loadTestEnv()
  initAdmin()
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const db = getAdminDb()
  const configSnap = await db.collection('shift_settings').doc('systems').get()
  originalConfig = configSnap.exists ? configSnap.data() : null

  const useLocal = process.env.E2E_SHIFTS_LOCAL === '1'
  const origin = useLocal ? VITE_ORIGIN : APP_ORIGIN
  if (useLocal) await startVitePreview()

  const { uid: testUid } = await import('./get-test-token.mjs').then((m) => m.getTestIdToken())
  uid = testUid

  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.route('**/api/users/bootstrap-profile', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[browser]', msg.text())
  })

  if (useLocal) {
    const customToken = await getAuth().createCustomToken(uid)
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function')
    await page.evaluate(async (token) => {
      await window.__e2eSignInWithCustomToken(token)
    }, customToken)
    await page.waitForFunction(
      async () => {
        if (typeof window.__getIdToken !== 'function') return false
        const token = await window.__getIdToken()
        return Boolean(token)
      },
      { timeout: 60_000 },
    )
    await page.getByRole('link', { name: /Entrar a la Intranet/ }).click()
    await page.waitForURL(/\/intranet/, { timeout: 60_000 })
    await page.waitForTimeout(3000)
  } else {
    throw new Error('Usá E2E_SHIFTS_LOCAL=1 para login con super_admin de prueba')
  }

  await page.goto(`${origin}/admin`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  console.log('URL tras /admin:', page.url())
  await page.goto(`${origin}/admin/shifts`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  console.log('URL tras /admin/shifts:', page.url())
  try {
    await page.getByRole('heading', { name: 'Turnos' }).waitFor({ timeout: 90_000 })
  } catch (err) {
    await page.screenshot({ path: resolve(OUTPUT_DIR, 'debug-shifts-admin.png'), fullPage: true })
    console.error('URL final:', page.url())
    console.error((await page.locator('body').innerText()).slice(0, 1200))
    throw err
  }
  const sistemasTab = page.getByRole('button', { name: 'Sistemas' })
  if (await sistemasTab.count()) await sistemasTab.click()
  try {
    await page.getByText('Orden de la rotación').waitFor({ timeout: 45_000 })
  } catch (err) {
    await page.screenshot({ path: resolve(OUTPUT_DIR, 'debug-shifts-page.png'), fullPage: true })
    console.error('URL:', page.url())
    console.error((await page.locator('body').innerText()).slice(0, 1500))
    throw err
  }

  const before = await readMemberOrder(page)
  console.log('Orden inicial:', before.join(' > '))
  if (before.length < 2) throw new Error('Se esperaban al menos 2 miembros en la rotación')

  const cristianIndex = before.findIndex((n) => n.includes('Cristian'))
  if (cristianIndex < 1) throw new Error(`Cristian no está en posición reordenable (index=${cristianIndex})`)

  const row = page.locator('ol li').filter({ hasText: 'Cristian' })
  await row.getByRole('button', { name: /Subir a Cristian/i }).click()
  await page.waitForTimeout(300)

  const afterMove = await readMemberOrder(page)
  console.log('Orden tras subir Cristian:', afterMove.join(' > '))
  if (afterMove[cristianIndex - 1] !== before[cristianIndex]) {
    throw new Error(`Reorden local falló. Antes: ${before.join(',')} Después: ${afterMove.join(',')}`)
  }

  await page.getByRole('button', { name: 'Guardar rotación' }).click()
  await page.getByText('Rotación de sistemas actualizada').waitFor({ timeout: 30_000 })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('Orden de la rotación').waitFor({ timeout: 30_000 })
  const afterReload = await readMemberOrder(page)
  console.log('Orden tras recargar:', afterReload.join(' > '))
  if (afterReload.join('|') !== afterMove.join('|')) {
    throw new Error(`No persistió tras reload. Esperado ${afterMove.join(',')} got ${afterReload.join(',')}`)
  }

  // Agregar y eliminar
  const testName = `E2E Turno ${Date.now()}`
  await page.getByPlaceholder('Nombre para agregar a la rotación').fill(testName)
  await page.getByRole('button', { name: 'Agregar' }).click()
  await page.waitForTimeout(200)
  let names = await readMemberOrder(page)
  if (!names.some((n) => n === testName)) throw new Error('Agregar no funcionó')

  const newIndex = names.indexOf(testName)
  await page.locator('ol li').filter({ hasText: testName }).getByRole('button', { name: new RegExp(`Quitar a ${testName}`) }).click()
  await page.waitForTimeout(200)
  names = await readMemberOrder(page)
  if (names.some((n) => n === testName)) throw new Error('Eliminar no funcionó')

  await page.getByRole('button', { name: 'Guardar rotación' }).click()
  await page.getByText('Rotación de sistemas actualizada').waitFor({ timeout: 30_000 })

  await page.screenshot({ path: SHOT, fullPage: true })
  console.log(`✅ E2E OK — captura: ${SHOT}`)
}

async function cleanup() {
  if (browser) await browser.close().catch(() => {})
  if (viteProcess) viteProcess.kill()
  if (!originalConfig) return
  try {
    await getAdminDb().collection('shift_settings').doc('systems').set(originalConfig)
    console.log('🧹 Rotación restaurada en Firestore')
  } catch (err) {
    console.error('⚠️ Limpieza incompleta:', err instanceof Error ? err.message : err)
  }
}

main()
  .then(cleanup)
  .catch(async (err) => {
    console.error('❌', err instanceof Error ? err.message : err)
    await cleanup()
    process.exit(1)
  })
