/**
 * Playwright: PDF en vivo, archivar campaña, historial y PDF archivado.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/e2e-helpdesk-campana-auditoria-pdf-archivo.mjs
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { getAuth } from 'firebase-admin/auth'
import { getAdminDb, getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const VITE_PORT = 5176
const API_PORT = 8796
const VITE = `http://127.0.0.1:${VITE_PORT}`
const API = `http://127.0.0.1:${API_PORT}`

async function waitOk(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`timeout ${url}`)
}

loadTestEnv()
initAdmin()

const ENV_DEV_LOCAL = resolve(ROOT, '.env.development.local')
const wroteEnv = !existsSync(ENV_DEV_LOCAL)
if (wroteEnv) writeFileSync(ENV_DEV_LOCAL, `VITE_API_BASE_URL=${API}\n`, 'utf8')

const { app } = await import('../lib/server.js')
const server = await new Promise((res, rej) => {
  const s = app.listen(API_PORT, '127.0.0.1', (e) => (e ? rej(e) : res(s)))
})
await waitOk(`${API}/api/health`)

execFileSync(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: ROOT,
  env: { ...process.env, VITE_API_BASE_URL: API, VITE_E2E: 'true' },
  stdio: 'inherit',
})
const vite = spawn(
  process.execPath,
  [
    resolve(ROOT, 'node_modules/vite/bin/vite.js'),
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    String(VITE_PORT),
    '--strictPort',
  ],
  {
    cwd: ROOT,
    env: { ...process.env, VITE_API_BASE_URL: API, VITE_E2E: 'true' },
    stdio: 'ignore',
    shell: false,
  },
)
await waitOk(VITE)

const db = getAdminDb()
const teamSnap = await db.collection('helpdeskTeam').where('activo', '==', true).limit(8).get()
const teamEmails = teamSnap.docs
  .map((d) => (typeof d.get('email') === 'string' ? d.get('email').trim().toLowerCase() : ''))
  .filter(Boolean)

let teamUid = null
for (const email of teamEmails) {
  try {
    teamUid = (await getAuth().getUserByEmail(email)).uid
    break
  } catch {
    /* next */
  }
}
if (!teamUid) teamUid = (await getTestIdToken()).uid

const idToken = await (async () => {
  const customToken = await getAuth().createCustomToken(teamUid)
  const apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_WEB_API_KEY
  if (!apiKey) throw new Error('Falta API key Firebase para idToken')
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  )
  const body = await res.json()
  if (!body.idToken) throw new Error('No idToken')
  return body.idToken
})()

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 960 } })
const downloadDir = resolve(OUT_DIR, 'campana-pdf-downloads')
mkdirSync(downloadDir, { recursive: true })

try {
  await page.goto(`${VITE}/`, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForFunction(() => typeof window.__e2eSignInWithCustomToken === 'function', {
    timeout: 120_000,
  })
  const customToken = await getAuth().createCustomToken(teamUid)
  await page.evaluate(async (t) => {
    await window.__e2eSignInWithCustomToken(t)
  }, customToken)
  await page.waitForFunction(
    async () => {
      const token = await window.__getIdToken?.()
      return typeof token === 'string' && token.length > 20
    },
    { timeout: 60_000 },
  )

  await page.goto(`${VITE}/sistemas/mesa-ayuda`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('helpdesk-mesa-panel').waitFor({ timeout: 60_000 })
  await page.getByTestId('helpdesk-campana-auditoria-tab').click()
  await page.getByTestId('helpdesk-campana-auditoria').waitFor({ timeout: 30_000 })
  await page.getByText('Cargando auditoría…').waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {})

  const errorVisible = await page.getByTestId('helpdesk-campana-auditoria-error').isVisible().catch(() => false)
  if (errorVisible) {
    throw new Error(await page.getByTestId('helpdesk-campana-auditoria-error').innerText())
  }
  await page.getByTestId('helpdesk-campana-auditoria-row').first().waitFor({ timeout: 60_000 })

  const liveAuditoriaRes = await fetch(`${API}/api/helpdesk/campana/auditoria`, {
    headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json' },
  })
  const liveAuditoria = await liveAuditoriaRes.json()
  function snapshotFilas(rows) {
    return (rows ?? []).slice(0, 5).map((r) => ({
      area: r.area ?? null,
      email: r.email ?? null,
      enviado: r.enviado ?? null,
      respondido: r.campana_cumplida ?? r.respondido ?? null,
    }))
  }
  const liveSnapshot = JSON.stringify(snapshotFilas(liveAuditoria.rows))

  const [liveDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByTestId('helpdesk-campana-auditoria-pdf').click(),
  ])
  const livePdfPath = resolve(downloadDir, 'campana-live.pdf')
  await liveDownload.saveAs(livePdfPath)
  const livePdfBuf = readFileSync(livePdfPath)
  if (livePdfBuf.length < 500 || livePdfBuf.toString('utf8', 0, 4) !== '%PDF') {
    throw new Error('PDF en vivo inválido o vacío')
  }
  const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js')
  const liveParsed = await pdfParse(livePdfBuf)
  if (!liveParsed.text.includes('BACARNET · SISTEMAS') || !liveParsed.text.includes('Auditoría de campaña')) {
    throw new Error('PDF en vivo sin encabezado esperado')
  }
  if (!liveParsed.text.includes('Áreas en campaña')) {
    throw new Error('PDF en vivo sin KPIs')
  }

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByTestId('helpdesk-campana-auditoria-archivar').click()
  await page.getByTestId('helpdesk-campana-auditoria-archived-banner').waitFor({ timeout: 60_000 })

  const archivedBanner = await page.getByTestId('helpdesk-campana-auditoria-archived-banner').innerText()
  const archivedRows = await page.getByTestId('helpdesk-campana-auditoria-row').count()
  if (archivedRows < 1) throw new Error('Vista archivada sin filas')

  const archivosRes = await fetch(`${API}/api/helpdesk/campana/archivos`, {
    headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json' },
  })
  const archivosBody = await archivosRes.json()
  const latest = archivosBody.archivos?.[0]
  if (!latest?.id) throw new Error('No hay archivo recién archivado')

  const detailRes = await fetch(`${API}/api/helpdesk/campana/archivos/${latest.id}`, {
    headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json' },
  })
  const detail = await detailRes.json()
  const archivedSnapshot = JSON.stringify(snapshotFilas(detail.filas))
  if (archivedSnapshot !== liveSnapshot) {
    throw new Error('Filas archivadas no coinciden con snapshot pre-archivo')
  }

  await page.getByTestId('helpdesk-campana-historial-anio').selectOption(String(latest.anio))
  await page.getByTestId('helpdesk-campana-historial-mes').selectOption(String(latest.mes))
  await page.getByTestId('helpdesk-campana-historial-semana').selectOption(latest.id)

  const [archDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByTestId('helpdesk-campana-auditoria-pdf').click(),
  ])
  const archPdfFile = resolve(downloadDir, 'campana-archived.pdf')
  await archDownload.saveAs(archPdfFile)
  const archBuf = readFileSync(archPdfFile)
  if (archBuf.length < 500) throw new Error('PDF archivado vacío')

  mkdirSync(OUT_DIR, { recursive: true })
  await page.getByTestId('helpdesk-campana-auditoria-archivar').screenshot({
    path: resolve(OUT_DIR, 'campana-auditoria-archivar-btn.png'),
  })
  await page.getByTestId('helpdesk-campana-auditoria-historial').screenshot({
    path: resolve(OUT_DIR, 'campana-auditoria-historial.png'),
  })

  const pdfPage = await browser.newPage()
  const pdfB64 = livePdfBuf.toString('base64')
  await pdfPage.setContent(
    `<!doctype html><html><body style="margin:0"><embed type="application/pdf" src="data:application/pdf;base64,${pdfB64}" width="820" height="1160"/></body></html>`,
    { waitUntil: 'load' },
  )
  await pdfPage.waitForTimeout(2000)
  await pdfPage.screenshot({
    path: resolve(OUT_DIR, 'campana-auditoria-pdf-page1.png'),
    fullPage: true,
  })
  await pdfPage.close()

  console.log(
    JSON.stringify({
      livePdfBytes: livePdfBuf.length,
      archivedPdfBytes: archBuf.length,
      archivoId: latest.id,
      banner: archivedBanner.slice(0, 80),
      screenshots: OUT_DIR,
    }),
  )
  console.log('PASS: PDF + archivar + historial campaña')
} finally {
  await browser.close()
  vite.kill('SIGTERM')
  await new Promise((r) => server.close(r))
  if (wroteEnv && existsSync(ENV_DEV_LOCAL)) unlinkSync(ENV_DEV_LOCAL)
}
