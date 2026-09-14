/**
 * Ejecuta la lógica real de recordarSolicitudesHelpdesk contra el webhook de prod,
 * con una fila de prueba in-memory (no toca jefes_areas).
 *
 *   npm --prefix backend run build
 *   node backend/scripts/test-helpdesk-recordatorio-real.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

loadEnvFile(resolve(SCRIPTS_DIR, '.env'))
loadEnvFile(resolve(SCRIPTS_DIR, '.env.local'))

const webhookUrl = process.env.HELPDESK_N8N_WEBHOOK_RECORDATORIO?.trim()
const outboundKey = process.env.HELPDESK_N8N_OUTBOUND_API_KEY?.trim()
if (!webhookUrl) throw new Error('HELPDESK_N8N_WEBHOOK_RECORDATORIO vacía en local')
if (!outboundKey) throw new Error('HELPDESK_N8N_OUTBOUND_API_KEY vacía en local')

const { reminderWebhookBody, runScheduledReminder } = await import(
  '../lib/modules/helpdesk/scheduledReminder.js'
)

const row = {
  id: 'test-real-recordatorio',
  email: 'admin@bacarsa.com.ar',
  nombre: 'Prueba',
  area: 'Sistemas',
  link: 'https://bacarnet.web.app/support?t=test',
  enviado: true,
  respondido: false,
  fecha_envio: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
}

const body = reminderWebhookBody(row)
if (!body || body.link !== row.link) {
  throw new Error('El body no tomó el link de la fila')
}

const summary = await runScheduledReminder({
  config: {
    managementCredential: 'unused',
    apiBase: 'https://example.invalid',
    tableId: 'unused',
    webhookUrl,
    outboundApiKey: outboundKey,
  },
  listRows: async () => [row],
})

console.log(
  JSON.stringify({
    webhookHost: new URL(webhookUrl).host,
    webhookPath: new URL(webhookUrl).pathname,
    bodyKeys: Object.keys(body),
    usedStoredLink: body.link === row.link,
    summary,
  }),
)

if (summary.enviadas !== 1 || summary.errores !== 0) {
  process.exit(1)
}
console.log('PASS: webhook de producción respondió 200')
