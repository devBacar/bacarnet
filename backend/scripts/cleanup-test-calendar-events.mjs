/**
 * Limpia eventos de prueba/probe en calendarios reales de Workspace.
 *
 *   node backend/scripts/cleanup-test-calendar-events.mjs
 *   node backend/scripts/cleanup-test-calendar-events.mjs --dry-run
 *   node backend/scripts/cleanup-test-calendar-events.mjs --user=admin@bacarsa.com.ar
 */

import { getCalendar } from '../lib/lib/google/workspaceGoogleClients.js'
import { loadTestEnv } from './get-test-token.mjs'
import {
  CALENDAR_TEST_ACCOUNTS,
  cleanupTestEventsForUser,
} from './test-calendar-utils.mjs'

loadTestEnv()

const dryRun = process.argv.includes('--dry-run')
const userArg = process.argv.find((arg) => arg.startsWith('--user='))?.slice(7)?.trim().toLowerCase()
const accounts = userArg ? [userArg] : CALENDAR_TEST_ACCOUNTS

async function main() {
  console.log('=== Limpieza de eventos de prueba en calendarios ===')
  console.log(dryRun ? '(dry-run — no se borra nada)' : '(modo borrado)')
  console.log('Cuentas:', accounts.join(', '))

  let totalFound = 0
  let totalDeleted = 0

  for (const account of accounts) {
    console.log(`\n→ ${account}`)
    const { found, deleted } = await cleanupTestEventsForUser(account, {
      dryRun,
      getCalendar,
    })
    totalFound += found
    totalDeleted += deleted
    if (found === 0) {
      console.log('  (sin eventos de prueba)')
    } else if (dryRun) {
      console.log(`  Encontrados: ${found} (no borrados)`)
    } else {
      console.log(`  Eliminados: ${deleted}/${found}`)
    }
  }

  console.log('\n=== Resumen ===')
  console.log(`Eventos de prueba encontrados: ${totalFound}`)
  console.log(dryRun ? 'Borrados: 0 (dry-run)' : `Borrados: ${totalDeleted}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
