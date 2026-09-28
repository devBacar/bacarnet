import { describe, expect, it } from 'vitest'
import {
  mapInterbankingBalancesResponse,
  normalizeInterbankingBankNumber,
  resolveBancoNombre,
  resolveTipoCuenta,
  saldoCentavosFromInterbanking,
} from './interbanking.mapping.js'

describe('interbanking.mapping', () => {
  it('normaliza códigos de banco', () => {
    expect(normalizeInterbankingBankNumber('34')).toBe('034')
    expect(normalizeInterbankingBankNumber('00305')).toBe('305')
    expect(resolveBancoNombre('034')).toBe('Patagonia')
  })

  it('ignora caja de ahorro (no operada vía Interbanking)', () => {
    expect(resolveTipoCuenta('CA', 'ARS')).toBeNull()
    expect(resolveTipoCuenta('CUENTA AHORRO', 'ARS')).toBeNull()
  })

  it('mapea solo CC reales (3 bancos)', () => {
    const banks = [
      { bank: '034', slug: 'patagonia' },
      { bank: '305', slug: 'julio' },
      { bank: '020', slug: 'cordoba' },
    ] as const
    const rows = banks.flatMap(({ bank, slug }) => [
      {
        bank_number: bank,
        currency: 'ARS',
        account_type: 'CA',
        account_number: `${slug}-ca`,
        balances: { current_operating_balance: 100.25 },
      },
      {
        bank_number: bank,
        currency: 'ARS',
        account_type: 'CC',
        account_number: `${slug}-cc`,
        balances: { countable_balance: -50 },
      },
      {
        bank_number: bank,
        currency: 'USD',
        account_type: 'CC',
        account_number: `${slug}-usd`,
        balances: { current_operating_balance: 10.5 },
      },
    ])

    const { accounts, balances } = mapInterbankingBalancesResponse(rows)
    expect(accounts).toHaveLength(6)
    expect(balances).toHaveLength(6)
    expect(accounts.map((a) => a.cuentaId).sort()).toEqual(
      [
        'cordoba-cc',
        'cordoba-usd',
        'julio-cc',
        'julio-usd',
        'patagonia-cc',
        'patagonia-usd',
      ].sort(),
    )
    expect(saldoCentavosFromInterbanking(rows[1])).toBe(-5000)
  })

  it('si Interbanking expone USD, mapea tipo USD (origen interbanking en sync)', () => {
    const { accounts } = mapInterbankingBalancesResponse([
      {
        bank_number: '034',
        currency: 'USD',
        account_type: 'CC',
        account_number: '123',
        balances: { current_operating_balance: 1 },
      },
    ])
    expect(accounts).toHaveLength(1)
    expect(accounts[0]?.tipo).toBe('USD')
    expect(accounts[0]?.cuentaId).toBe('patagonia-usd')
  })
})
