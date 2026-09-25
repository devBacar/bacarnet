/**
 * Sincroniza CC desde el proveedor bancario y asegura placeholders USD manuales.
 *
 *   npm run finanzas:seed:dry-run
 *   npm run finanzas:seed
 */

import { resolveFinanzasBankProviderMode } from '../lib/modules/finanzas/adapters/bank-data-provider.factory.js'
import { syncCuentasFromProvider } from '../lib/modules/finanzas/services/cuentas.service.js'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const dryRun = !process.argv.includes('--apply')
const SEED_ACTOR_UID = 'finanzas-seed-script'

async function main() {
  loadTestEnv()
  initAdmin()

  const providerMode = resolveFinanzasBankProviderMode()
  if (dryRun) {
    console.log(
      `[dry-run] Se sincronizarían cuentas desde proveedor "${providerMode}" (sin escribir).`,
    )
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
