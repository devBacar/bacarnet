/**
 * GET /api/helpdesk/campana/auditoria contra n8n real.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/test-helpdesk-campana-auditoria.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTestIdToken, initAdmin, loadTestEnv } from './get-test-token.mjs'

const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function record(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}

loadEnvFile(resolve(SCRIPTS_DIR, '.env'))
loadEnvFile(resolve(SCRIPTS_DIR, '.env.local'))
loadTestEnv()
initAdmin()

const { app } = await import('../lib/server.js')
const port = Number(process.env.HELPDESK_TEST_PORT ?? 8803)
const server = await new Promise((resolvePromise, reject) => {
  const s = app.listen(port, '127.0.0.1', (err) => (err ? reject(err) : resolvePromise(s)))
})
const url = `http://127.0.0.1:${port}/api/helpdesk/campana/auditoria`

try {
  const { getAdminDb } = await import('./get-test-token.mjs')
  const db = getAdminDb()
  const teamSnap = await db.collection('helpdeskTeam').where('activo', '==', true).get()
  const teamEmails = new Set(
    teamSnap.docs.map((d) =>
      typeof d.get('email') === 'string' ? d.get('email').trim().toLowerCase() : '',
    ),
  )
  const usersSnap = await db.collection('users').limit(80).get()
  let outsiderEmail = ''
  for (const doc of usersSnap.docs) {
    const email = typeof doc.get('email') === 'string' ? doc.get('email').trim().toLowerCase() : ''
    if (!email || teamEmails.has(email)) continue
    if (doc.get('role') === 'super_admin') continue
    if (doc.get('accountType') === 'external') continue
    outsiderEmail = email
    break
  }
  if (!outsiderEmail) throw new Error('No hay usuario corporativo fuera de helpdeskTeam')
  process.env.TEST_EMAIL = outsiderEmail
  const outsider = await getTestIdToken({ requireSuperAdmin: false })
  const forbidden = await fetch(url, {
    headers: { Authorization: `Bearer ${outsider.idToken}`, Accept: 'application/json' },
  })
  record('403 fuera del equipo', forbidden.status === 403, `status ${forbidden.status}`)

  process.env.TEST_EMAIL = process.env.HELPDESK_TEST_TEAM_EMAIL?.trim() || 'admin@bacarsa.com.ar'
  const insider = await getTestIdToken({ requireSuperAdmin: true })
  const okRes = await fetch(url, {
    headers: { Authorization: `Bearer ${insider.idToken}`, Accept: 'application/json' },
  })
  const body = await okRes.json().catch(() => ({}))
  const rows = Array.isArray(body.rows) ? body.rows : []
  const sample = rows[0]
  const keysOk =
    sample &&
    ['nombre', 'area', 'email', 'enviado', 'fecha_envio', 'respondido', 'fecha_respuesta', 'link'].every(
      (key) => Object.prototype.hasOwnProperty.call(sample, key),
    )
  record(
    '200 equipo con filas de n8n',
    okRes.status === 200 && rows.length >= 1 && keysOk,
    `status ${okRes.status} rows=${rows.length}`,
  )
  if (okRes.status !== 200) {
    console.log(JSON.stringify({ error: body.error ?? body }, null, 2))
  }
} finally {
  await new Promise((r) => server.close(r))
}

if (process.exitCode) {
  console.log('\nFAIL')
  process.exit(1)
}
console.log('\nPASS')
