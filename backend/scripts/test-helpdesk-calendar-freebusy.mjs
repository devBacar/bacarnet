/**
 * Paso 1: freebusy real contra calendarios de Mauro y Franco.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/test-helpdesk-calendar-freebusy.mjs
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

async function main() {
  loadEnvFile(resolve(SCRIPTS_DIR, '.env'))
  loadEnvFile(resolve(SCRIPTS_DIR, '.env.local'))

  const emails = ['admin@bacarsa.com.ar', 'sistemas.ti@bacarsa.com.ar']
  const now = new Date()
  const timeMinISO = now.toISOString()
  const timeMaxISO = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { getFreeBusyForEmails } = await import('../lib/modules/helpdesk/calendar.js')
  const busy = await getFreeBusyForEmails(emails, timeMinISO, timeMaxISO)

  for (const email of emails) {
    const blocks = busy[email] ?? []
    console.log(`${email}: ${blocks.length} bloques ocupados en la próxima semana`)
  }
  console.log('PASS  getFreeBusyForEmails')
}

main().catch((err) => {
  console.error('FAIL', err)
  process.exit(1)
})
