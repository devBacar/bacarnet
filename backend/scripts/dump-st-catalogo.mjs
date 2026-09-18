import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function loadEnvFile(envPath) {
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

for (const p of [
  resolve(ROOT, 'backend/.env'),
  resolve(ROOT, 'backend/.env.local'),
  resolve(ROOT, '.env.local'),
]) {
  loadEnvFile(p)
}

const key = process.env.ST_INTEGRATION_API_KEY?.trim() ?? ''
const base = process.env.ST_BASE_URL?.trim()?.replace(/\/$/, '') || 'https://bacarsa.dyndns.org'
if (!key) {
  console.error('Missing ST_INTEGRATION_API_KEY in backend/.env.local')
  process.exit(1)
}
const res = await fetch(`${base}/api/integrations/bacarnet/catalogo`, {
  headers: { 'X-Api-Key': key, Accept: 'application/json' },
})
const body = await res.json()
if (!res.ok) {
  console.error('HTTP', res.status, body)
  process.exit(1)
}
console.log(JSON.stringify(body, null, 2))
