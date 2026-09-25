/**
 * Resetea las 3 USD manuales: saldo 0 y sin campos de auditoría (demo / limpieza mock).
 *
 *   node backend/scripts/finanzas-reset-manual-usd-never-loaded.mjs
 *   node backend/scripts/finanzas-reset-manual-usd-never-loaded.mjs --apply
 */
import { resetManualUsdAccountsNeverLoaded } from '../lib/modules/finanzas/services/cuentas.repository.js'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const apply = process.argv.includes('--apply')

async function main() {
  loadTestEnv()
  initAdmin()
  if (!apply) {
    console.log('[dry-run] Resetearía patagonia-usd, julio-usd, cordoba-usd (saldo 0, sin auditoría).')
    console.log('Ejecutá con --apply para escribir en Firestore.')
    return
  }
  await resetManualUsdAccountsNeverLoaded()
  console.log('OK: USD manuales en estado «nunca cargadas».')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
