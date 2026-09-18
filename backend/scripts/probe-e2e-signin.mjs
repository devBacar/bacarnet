/**
 * Diagnóstico: por qué Playwright no ve «Sesión activa» tras custom token.
 */
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { chromium } from 'playwright'
import { getAdminDb, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const VITE_PORT = 5199
const API_PORT = 8810
const VITE = `http://127.0.0.1:${VITE_PORT}`
const API = `http://127.0.0.1:${API_PORT}`

async function waitOk(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`timeout ${url}`)
}

loadTestEnv()
initAdmin()
const auth = getAuth()
const db = getAdminDb()

const email = `e2e.probe.${Date.now()}@bacarsa.com.ar`
const created = await auth.createUser({ email, emailVerified: true, displayName: 'E2E Probe' })
const uid = created.uid
await db.collection('users').doc(uid).set({
  email,
  displayName: 'E2E Probe',
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

const { app } = await import('../lib/server.js')
const server = await new Promise((resolvePromise, reject) => {
  const s = app.listen(API_PORT, '127.0.0.1', (err) => (err ? reject(err) : resolvePromise(s)))
})
const vite = spawn(
  'npx',
  ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'],
  {
    cwd: ROOT,
    env: { ...process.env, VITE_API_BASE_URL: API, VITE_E2E: 'true' },
    shell: true,
    stdio: 'ignore',
  },
)

const logs = []
try {
  await waitOk(`${API}/api/health`)
  await waitOk(VITE)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.on('console', (msg) => logs.push(`[console ${msg.type()}] ${msg.text()}`))
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`))
  page.on('response', (res) => {
    if (res.status() >= 400) {
      logs.push(`[http ${res.status()}] ${res.url()}`)
    }
  })

  await page.goto(`${VITE}/`, { waitUntil: 'domcontentloaded' })

  const hasHelper = await page.evaluate(() => typeof window.__e2eSignInWithCustomToken === 'function')
  console.log('__e2eSignInWithCustomToken definido:', hasHelper)
  const customToken = await auth.createCustomToken(uid)
  const signInResult = await page.evaluate(async (token) => {
    try {
      const cred = await window.__e2eSignInWithCustomToken(token)
      return {
        ok: true,
        uid: cred.user?.uid ?? null,
        email: cred.user?.email ?? null,
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }, customToken)
  console.log('signInWithCustomToken:', signInResult)

  await page.waitForTimeout(15000)

  const snapshot = await page.evaluate(() => {
    const body = document.body?.innerText?.slice(0, 800) ?? ''
    return {
      bodyPreview: body,
      hasSesionActiva: body.includes('Sesión activa'),
      hasVerificando: body.includes('Verificando sesión'),
      hasIniciar: body.includes('Iniciar sesión') || body.includes('Google'),
    }
  })
  console.log('Estado UI tras 8s:', snapshot)

  const tokenProbe = await page.evaluate(async () => {
    if (typeof window.__getIdToken !== 'function') return { hasGetIdToken: false }
    try {
      const t = await window.__getIdToken()
      return { hasGetIdToken: true, hasToken: Boolean(t) }
    } catch (e) {
      return { hasGetIdToken: true, error: String(e) }
    }
  })
  console.log('ID token en cliente:', tokenProbe)

  if (logs.length) {
    console.log('\n--- Consola navegador ---')
    for (const line of logs.slice(0, 30)) console.log(line)
  }

  await browser.close()
} finally {
  vite.kill('SIGTERM')
  server.close()
  await db.collection('users').doc(uid).delete().catch(() => {})
  await auth.deleteUser(uid).catch(() => {})
}
