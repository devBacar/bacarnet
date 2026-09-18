/**
 * Rota un secreto WIDGETS_OAUTH_* en Secret Manager y redeploya widgetsApi.
 *
 * No pases el valor en la línea de comandos (queda en el historial). Setealo en el
 * entorno de la sesión actual y ejecutá este script con el nombre del secreto.
 *
 * Secretos soportados:
 *   WIDGETS_OAUTH_CLIENT_SECRET
 *   WIDGETS_OAUTH_TOKEN_ENCRYPTION_KEY
 *   WIDGETS_OAUTH_STATE_SECRET
 *
 * PowerShell (ejemplo Client Secret):
 *   $env:WIDGETS_OAUTH_CLIENT_SECRET = 'GOCSPX-...'
 *   node backend/scripts/rotate-widgets-oauth-secret.mjs WIDGETS_OAUTH_CLIENT_SECRET
 *
 * Bash:
 *   export WIDGETS_OAUTH_CLIENT_SECRET='GOCSPX-...'
 *   node backend/scripts/rotate-widgets-oauth-secret.mjs WIDGETS_OAUTH_CLIENT_SECRET
 *
 * TOKEN_ENCRYPTION_KEY / STATE_SECRET: generá con
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * y exportá la misma variable con el nombre correspondiente antes de ejecutar.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ALLOWED = new Set([
  'WIDGETS_OAUTH_CLIENT_SECRET',
  'WIDGETS_OAUTH_TOKEN_ENCRYPTION_KEY',
  'WIDGETS_OAUTH_STATE_SECRET',
])

const PROJECT = 'bacar-web'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const secretName = process.argv[2]?.trim()
if (!secretName || !ALLOWED.has(secretName)) {
  console.error('Uso: node backend/scripts/rotate-widgets-oauth-secret.mjs <SECRET_NAME>')
  console.error('SECRET_NAME:', [...ALLOWED].join(' | '))
  process.exit(1)
}

const value = process.env[secretName]?.trim()
if (!value) {
  console.error(`Definí ${secretName} en el entorno (sin pegarlo como argumento del script).`)
  process.exit(1)
}

const dir = mkdtempSync(join(tmpdir(), 'rotate-widgets-oauth-'))
try {
  const file = join(dir, 'value')
  writeFileSync(file, value, 'utf8')

  console.log(`→ Secret Manager: ${secretName} (${value.length} chars)`)
  const setResult = spawnSync(
    'npx',
    ['firebase', 'functions:secrets:set', secretName, '--project', PROJECT, '--data-file', file],
    { stdio: 'inherit', shell: true, cwd: ROOT },
  )
  if (setResult.status !== 0) process.exit(setResult.status ?? 1)

  console.log('→ Deploy functions:widgetsApi')
  const deployResult = spawnSync(
    'npx',
    ['firebase', 'deploy', '--only', 'functions:widgetsApi', '--project', PROJECT],
    { stdio: 'inherit', shell: true, cwd: ROOT },
  )
  if (deployResult.status !== 0) process.exit(deployResult.status ?? 1)

  const access = spawnSync(
    'npx',
    ['firebase', 'functions:secrets:access', secretName, '--project', PROJECT],
    { encoding: 'utf8', shell: true, cwd: ROOT },
  )
  const len = (access.stdout ?? '').trim().length
  console.log(`✓ ${secretName} activo en SM (longitud ${len} chars)`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
