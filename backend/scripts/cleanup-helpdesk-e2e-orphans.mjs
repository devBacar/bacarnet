/**
 * Lista y borra tickets helpdesk de prueba (E2E en área o solicitante).
 *
 *   node backend/scripts/cleanup-helpdesk-e2e-orphans.mjs
 *   node backend/scripts/cleanup-helpdesk-e2e-orphans.mjs --apply
 */

import {
  deleteHelpdeskTicketFull,
  listE2EHelpdeskTickets,
  loadHelpdeskCleanupEnv,
} from './helpdesk-e2e-cleanup.mjs'

const apply = process.argv.includes('--apply')

async function main() {
  loadHelpdeskCleanupEnv()
  const rows = await listE2EHelpdeskTickets()
  console.log(`Tickets E2E encontrados: ${rows.length}\n`)
  for (const row of rows) {
    console.log(`- ${row.id}  creado=${row.createdAt}`)
    console.log(`    área=${row.areaNombre}`)
    console.log(`    solicitante=${row.requesterNombre}`)
  }

  if (!apply) {
    console.log('\n(dry-run — pasá --apply para borrar)')
    return
  }

  console.log('\nBorrando…')
  for (const row of rows) {
    const ok = await deleteHelpdeskTicketFull(row.id)
    console.log(`  ${row.id}: ${ok ? 'OK' : 'FALLÓ'}`)
  }

  const remaining = await listE2EHelpdeskTickets()
  console.log(`\nRestantes E2E: ${remaining.length}`)
  if (remaining.length > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
