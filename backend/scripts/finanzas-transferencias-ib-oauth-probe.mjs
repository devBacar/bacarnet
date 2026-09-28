/**
 * PASO A — Solo login OAuth (password) Transferencias Interbanking.
 *
 *   FINANZAS_TRANSFERENCIAS_PROVIDER=interbanking \
 *   node backend/scripts/finanzas-transferencias-ib-oauth-probe.mjs
 *
 * Requiere backend/.env.local con credenciales (ver interbanking-transfer.config.ts).
 */

import { loadTestEnv } from './get-test-token.mjs'
import { fetchInterbankingTransferAccessToken } from '../lib/modules/finanzas/transferencias/adapters/interbanking-transfer-auth.js'

loadTestEnv()

async function main() {
  if (process.env.FINANZAS_TRANSFERENCIAS_PROVIDER?.trim().toLowerCase() !== 'interbanking') {
    console.warn(
      'Aviso: FINANZAS_TRANSFERENCIAS_PROVIDER no es "interbanking"; el probe igual valida credenciales.',
    )
  }

  const result = await fetchInterbankingTransferAccessToken({ forceRefresh: true })
  const prefix = result.accessToken.slice(0, 12)
  console.log('PASS  Login Interbanking Transferencias (OAuth password)')
  console.log(`      token_type=${result.tokenType} expires_in=${result.expiresIn}s prefix=${prefix}…`)
}

main().catch((err) => {
  console.error('FAIL ', err instanceof Error ? err.message : err)
  process.exit(1)
})
