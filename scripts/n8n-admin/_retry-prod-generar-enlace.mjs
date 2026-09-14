import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
for (const line of readFileSync(resolve(ROOT, 'backend/.env.local'), 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('=')
  if (eq <= 0) continue
  const k = t.slice(0, eq).trim()
  let v = t.slice(eq + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (process.env[k] === undefined) process.env[k] = v
}

const url =
  'https://southamerica-east1-bacar-web.cloudfunctions.net/api/api/helpdesk/campana/generar-enlace'
const body = JSON.stringify({
  email: 'surlymeyer@gmail.com',
  nombre: 'Surly Meyer',
  areaNombre: 'Seguridad de Planta',
})

for (let attempt = 1; attempt <= 5; attempt++) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': process.env.HELPDESK_N8N_API_KEY },
    body,
  })
  const text = await r.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  console.log(`attempt ${attempt}:`, r.status, json.error ?? (json.link ? 'link ok' : json))
  if (r.ok && json.link?.includes('?t=')) process.exit(0)
  if (r.status === 429) await new Promise((res) => setTimeout(res, 20000))
  else if (!r.ok) process.exit(1)
}
process.exit(1)
