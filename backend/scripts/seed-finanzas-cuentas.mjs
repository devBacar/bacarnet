/**
 * Carga las 9 cuentas del MockProvider en Firestore (emulador o proyecto activo).
 *
 *   npm run finanzas:seed:dry-run
 *   npm run finanzas:seed
 */

import { syncCuentasFromProvider } from '../lib/modules/finanzas/services/cuentas.service.js'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const dryRun = !process.argv.includes('--apply')
const SEED_ACTOR_UID = 'finanzas-seed-script'

async function main() {
  loadTestEnv()
  initAdmin()

  if (dryRun) {
    console.log('[dry-run] Se sincronizarían 9 cuentas desde MockProvider (sin escribir).')
    console.log('Ejecutá con --apply para persistir en Firestore.')
    return
  }

  const result = await syncCuentasFromProvider({ actorUid: SEED_ACTOR_UID })
  console.log(`Finanzas seed OK: ${result.synced} cuentas + snapshot del día.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
