/**
 * PASO B — un solo POST cuentas propias v2 (Patagonia CC → Julio CC, $1).
 *
 *   node backend/scripts/finanzas-transferencias-ib-paso-b-post.mjs
 */
import { loadTestEnv } from './get-test-token.mjs'

loadTestEnv()

const { interbankingTransferenciasProvider } = await import(
  '../lib/modules/finanzas/transferencias/adapters/interbanking-transferencias-provider.js'
)
const { generateInterbankingConfeccionId } = await import(
  '../lib/modules/finanzas/transferencias/adapters/interbanking-transfer-confection.js'
)

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
const confectionId = generateInterbankingConfeccionId()

const result = await interbankingTransferenciasProvider.confeccionarCuentasPropiasV2({
  confectionId,
  requestDate: today,
  amountPesosString: '1.00',
  debit: {
    bank_number: '034',
    account_type: 'CC',
    currency: 'ARS',
    account_number: '07070037003700020',
    account_cbu: '0340070800700370037009',
  },
  credit: {
    bank_number: '305',
    account_type: 'CC',
    currency: 'ARS',
    account_number: '00010101000130345',
    account_cbu: '3050001101010001303450',
  },
})

console.log(
  JSON.stringify(
    {
      httpStatus: result.httpStatus,
      requestUrl: result.requestUrl,
      confection_id_sent: confectionId,
      parsed: result.parsed,
      responseBody: result.responseBody,
    },
    null,
    2,
  ),
)
