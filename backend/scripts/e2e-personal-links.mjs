/**
 * E2E: Mis enlaces en Home + rechazo Firestore al editar otro usuario.
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, signInWithCustomToken } from 'firebase/auth'
import { doc, getFirestore, updateDoc } from 'firebase/firestore'
import { chromium } from 'playwright'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUTPUT_DIR = resolve(ROOT, 'backend/scripts/output')
const SHOT = resolve(OUTPUT_DIR, 'mis-enlaces-home.png')
const VITE_PORT = 5207
const VITE_ORIGIN = `http://127.0.0.1:${VITE_PORT}`

let viteProcess = null
let browser = null
let ownerUid = null
let otherUid = null

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

async function assertOtherUserCannotEditPersonalLinks(victimUid, attackerUid) {
  loadTestEnv()
  const apiKey = process.env.VITE_FIREBASE_API_KEY?.trim()
  if (!apiKey) throw new Error('Falta VITE_FIREBASE_API_KEY')

  const firebaseConfig = {
    apiKey,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  }

  const app = initializeApp(firebaseConfig, `e2e-rules-${Date.now()}`)
  try {
    const customToken = await getAdminAuth().createCustomToken(attackerUid)
    const auth = getAuth(app)
    await signInWithCustomToken(auth, customToken)
    const db = getFirestore(app)

    let denied = false
    try {
      await updateDoc(doc(db, 'users', victimUid), {
        personalLinks: [{ id: 'hack', title: 'X', url: 'https://example.com', order: 0 }],
      })
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
      denied = code.includes('permission-denied')
    }

    if (!denied) throw new Error('Se esperaba permission-denied al editar personalLinks ajeno')
    console.log('✅ Firestore rechazó personalLinks en otro usuario')
  } finally {
    await deleteApp(app)
  }
}

async function main() {
  loadTestEnv()
  initAdmin()
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const runId = Date.now()
  const db = getAdminDb()
  const adminAuth = getAdminAuth()

  ownerUid = (await adminAuth.createUser({
    email: `e2e.links.owner.${runId}@bacarsa.com.ar`,
    emailVerified: true,
    displayName: 'E2E Links Owner',
  })).uid

  otherUid = (await adminAuth.createUser({
    email: `e2e.links.other.${runId}@bacarsa.com.ar`,
    emailVerified: true,
    displayName: 'E2E Links Other',
  })).uid

  for (const [uid, email, name] of [
    [ownerUid, `e2e.links.owner.${runId}@bacarsa.com.ar`, 'E2E Links Owner'],
    [otherUid, `e2e.links.other.${runId}@bacarsa.com.ar`, 'E2E Links Other'],
  ]) {
    await db.collection('users').doc(uid).set({
      email,
      displayName: name,
      role: 'user',
      department: 'General',
      accountType: 'corporate',
      accountStatus: 'active',
      permissions: { view_directory: true, view_drive: true, view_links: true },
      favoriteApps: [],
      personalLinks: [],
      widgetPreferences: { weather: true, dollar: true, systemsShift: false },
    })
  }

  await assertOtherUserCannotEditPersonalLinks(ownerUid, otherUid)

  await startVitePreview()
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.route('**/api/users/bootstrap-profile', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )

  const customToken = await adminAuth.createCustomToken(ownerUid)
  await page.goto(`${VITE_ORIGIN}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function')
  await page.evaluate(async (token) => {
    await window.__e2eSignInWithCustomToken(token)
  }, customToken)
  await page.waitForFunction(async () => {
    if (typeof window.__getIdToken !== 'function') return false
    return Boolean(await window.__getIdToken())
  })

  await page.getByRole('link', { name: /Entrar a la Intranet/ }).click()
  await page.waitForURL(/\/intranet/, { timeout: 60_000 })

  await page.getByText('Mis enlaces').waitFor({ timeout: 60_000 })
  await page.getByTestId('personal-links-empty').waitFor()

  const samples = [
    { title: 'ARCA', url: 'https://www.arca.gob.ar/' },
    { title: 'Banco Galicia', url: 'https://www.galicia.ar/personas' },
    { title: 'Sistemas internos', url: 'https://bacarnet.web.app/accesos-directos' },
  ]

  for (const sample of samples) {
    await page.getByTestId('personal-links-add-toggle').click()
    await page.getByTestId('personal-links-title').fill(sample.title)
    await page.getByTestId('personal-links-url').fill(sample.url)
    await page.getByTestId('personal-links-submit').click()
    await page.getByTestId('personal-links-list').getByText(sample.title).waitFor({ timeout: 15_000 })
  }

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('Mis enlaces').waitFor({ timeout: 60_000 })
  for (const sample of samples) {
    await page.getByTestId('personal-links-list').getByText(sample.title).waitFor()
  }
  console.log('✅ Enlaces persistieron tras recargar')

  await page.screenshot({ path: SHOT, fullPage: true })

  const first = samples[0]
  const listItem = page.getByTestId('personal-links-list').locator('li').filter({ hasText: first.title })
  page.once('dialog', (dialog) => dialog.accept())
  await listItem.getByRole('button', { name: new RegExp(`Eliminar ${first.title}`) }).click()
  await page.waitForFunction(
    (title) => !document.body.innerText.includes(title),
    first.title,
    { timeout: 15_000 },
  )
  console.log('✅ Enlace eliminado tras confirmación')
  console.log(`✅ Captura: ${SHOT}`)
}

async function cleanup() {
  if (browser) await browser.close().catch(() => {})
  if (viteProcess) viteProcess.kill()
  const adminAuth = getAdminAuth()
  const db = getAdminDb()
  for (const uid of [ownerUid, otherUid]) {
    if (!uid) continue
    await db.collection('users').doc(uid).delete().catch(() => {})
    await adminAuth.deleteUser(uid).catch(() => {})
  }
}

main()
  .then(cleanup)
  .catch(async (err) => {
    console.error('❌', err instanceof Error ? err.message : err)
    await cleanup()
    process.exit(1)
  })
