/**
 * Imprime URL + body v2 cuentas propias (PASO B). No envía POST.
 *
 *   node backend/scripts/finanzas-transferencias-ib-payload-preview.mjs
 */
import { loadTestEnv } from './get-test-token.mjs'
import {
  buildConfeccionRequestUrl,
  buildOwnAccountConfeccionBodyV2,
  generateInterbankingConfeccionId,
} from '../lib/modules/finanzas/transferencias/adapters/interbanking-transfer-confection.js'

loadTestEnv()

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

const body = buildOwnAccountConfeccionBodyV2({
  confectionId: generateInterbankingConfeccionId(),
  requestDate: today,
  amountPesosString: '1.00',
  operatorIdNumber: process.env.INTERBANKING_TRANSFER_OPERATOR_ID_NUMBER?.trim() || '32317104',
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

const url = buildConfeccionRequestUrl('cuentas_propias')

console.log('POST', url)
console.log(JSON.stringify(body, null, 2))
