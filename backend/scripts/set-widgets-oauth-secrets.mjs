/**
 * Carga secretos WIDGETS_OAUTH_* en Secret Manager (una sola ejecución).
 * Uso: node backend/scripts/set-widgets-oauth-secrets.mjs
 * Requiere: WIDGETS_OAUTH_CLIENT_SECRET, WIDGETS_OAUTH_TOKEN_ENCRYPTION_KEY, WIDGETS_OAUTH_STATE_SECRET en env.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const project = 'bacar-web'
const pairs = [
  ['WIDGETS_OAUTH_CLIENT_SECRET', process.env.WIDGETS_OAUTH_CLIENT_SECRET],
  ['WIDGETS_OAUTH_TOKEN_ENCRYPTION_KEY', process.env.WIDGETS_OAUTH_TOKEN_ENCRYPTION_KEY],
  ['WIDGETS_OAUTH_STATE_SECRET', process.env.WIDGETS_OAUTH_STATE_SECRET],
]

const dir = mkdtempSync(join(tmpdir(), 'widgets-oauth-'))
try {
  for (const [name, value] of pairs) {
    if (!value?.trim()) {
      console.error(`Falta ${name}`)
      process.exit(1)
    }
    const file = join(dir, name)
    writeFileSync(file, value.trim(), 'utf8')
    const r = spawnSync(
      'npx',
      ['firebase', 'functions:secrets:set', name, '--project', project, '--data-file', file],
      { stdio: 'inherit', shell: true },
    )
    if (r.status !== 0) process.exit(r.status ?? 1)
    console.log(`OK ${name} (${value.trim().length} chars)`)
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
