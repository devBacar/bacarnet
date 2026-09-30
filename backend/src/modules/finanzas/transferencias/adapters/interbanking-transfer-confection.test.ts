import { describe, expect, it } from 'vitest'
import { resolveInterbankingCuentaPorCbu } from './interbanking-cuenta.routing.js'
import {
  buildSupplierConfeccionBodyV2,
  buildThirdPartyConfeccionBodyV2,
} from './interbanking-transfer-confection.js'

const debit = {
  bank_number: '034',
  account_type: 'CC' as const,
  currency: 'ARS' as const,
  account_number: '07070037003700020',
  account_cbu: '0340070800700370037009',
}

const CBU_EXTERNO = '0720000700000001234567'
const credit = resolveInterbankingCuentaPorCbu(CBU_EXTERNO)

const base = {
  confectionId: '123456789012345678',
  requestDate: '2026-09-29',
  amountPesosString: '1500.50',
  debit,
  credit,
  comments: 'Pago de factura',
  cuit: '20-12345678-6',
  operatorIdNumber: '30111222',
}

const CLAVES_COMANDO = [
  'operator_id_number',
  'operator_country_code',
  'consolidated_check',
  'unified_send',
  'resend_validated',
  'found_transfers',
]

const CLAVES_CUENTA = ['bank_number', 'account_type', 'currency', 'account_number', 'account_cbu']

describe('body v2 de terceros y proveedores', () => {
  it('terceros trae los campos obligatorios y los formatos de monto, fecha, CBU y CUIT', () => {
    const body = buildThirdPartyConfeccionBodyV2({ ...base, concept: 'FAC', disclaimerAccepted: false })
    expect(Object.keys(body).sort()).toEqual([...CLAVES_COMANDO].sort())
    expect(body.operator_country_code).toBe('AR')
    expect(body.operator_id_number).toBe('30111222')
    expect(body.consolidated_check).toBe(false)
    expect(body.unified_send).toBe(true)
    expect(body.resend_validated).toBe(true)

    const linea = body.found_transfers[0]!
    expect(linea.confection_id).toMatch(/^\d{1,18}$/)
    expect(linea.request_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(linea.amount).toMatch(/^\d+\.\d{2}$/)
    expect(linea.concept).toBe('FAC')
    expect(linea.disclaimer_accepted).toBe(false)
    expect(linea.comments).toBe('Pago de factura')
    expect(JSON.stringify(body)).not.toMatch(/cuit/i)

    for (const cuenta of [linea.debit_account, linea.credit_account]) {
      expect(Object.keys(cuenta).sort()).toEqual([...CLAVES_CUENTA].sort())
      expect(cuenta.bank_number).toMatch(/^\d{3}$/)
      expect(cuenta.account_type).toMatch(/^(CC|CA)$/)
      expect(cuenta.currency).toMatch(/^(ARS|USD)$/)
      expect(cuenta.account_number).toMatch(/^\d+$/)
      expect(cuenta.account_cbu).toMatch(/^\d{22}$/)
    }
    expect(linea.credit_account.bank_number).toBe('072')
    expect(linea.credit_account.account_number).toBe(CBU_EXTERNO.slice(8, 21))
    expect(linea.credit_account.account_number).toHaveLength(13)
  })

  it('sin motivo usa Varios y rechaza CUIT que no tiene 11 dígitos', () => {
    const body = buildThirdPartyConfeccionBodyV2({ ...base, cuit: null, concept: null })
    expect(body.found_transfers[0]?.concept).toBe('VAR')
    expect(() => buildThirdPartyConfeccionBodyV2({ ...base, cuit: '123' })).toThrow(/11 dígitos/)
    expect(() => buildThirdPartyConfeccionBodyV2({ ...base, concept: 'OIN' })).toThrow(/aviso/)
    const conAviso = buildThirdPartyConfeccionBodyV2({
      ...base,
      concept: 'OIN',
      disclaimerAccepted: true,
    })
    expect(conAviso.found_transfers[0]?.disclaimer_accepted).toBe(true)
    expect(conAviso.found_transfers[0]?.concept).toBe('OIN')
  })

  it('proveedores arma el mismo sobre y no manda concepto', () => {
    const body = buildSupplierConfeccionBodyV2(base)
    expect(Object.keys(body).sort()).toEqual([...CLAVES_COMANDO].sort())
    const linea = body.found_transfers[0]!
    expect(linea.confection_id).toBe('123456789012345678')
    expect(linea.request_date).toBe('2026-09-29')
    expect(linea.amount).toBe('1500.50')
    expect(linea.debit_account.account_cbu).toMatch(/^\d{22}$/)
    expect(linea.credit_account.account_cbu).toMatch(/^\d{22}$/)
    expect(linea).not.toHaveProperty('concept')
    expect(linea).not.toHaveProperty('disclaimer_accepted')
    expect(JSON.stringify(body)).not.toMatch(/cuit/i)
    expect(() => buildSupplierConfeccionBodyV2({ ...base, cuit: '20-1' })).toThrow(/11 dígitos/)
  })

  it('el body v2 lleva el tipo de cuenta elegido y una cuenta propia sigue con su ruteo', () => {
    const caja = resolveInterbankingCuentaPorCbu(CBU_EXTERNO, 'CA')
    const terceros = buildThirdPartyConfeccionBodyV2({ ...base, credit: caja, concept: 'VAR' })
    expect(terceros.found_transfers[0]?.credit_account.account_type).toBe('CA')
    expect(terceros.found_transfers[0]?.debit_account.account_type).toBe('CC')

    const corriente = resolveInterbankingCuentaPorCbu(CBU_EXTERNO, 'CC')
    const proveedores = buildSupplierConfeccionBodyV2({ ...base, credit: corriente })
    expect(proveedores.found_transfers[0]?.credit_account.account_type).toBe('CC')

    const propia = resolveInterbankingCuentaPorCbu('0340070800700370037009', 'CA')
    expect(propia.account_type).toBe('CC')
    expect(propia.account_cbu).toBe('0340070800700370037009')
  })
})
