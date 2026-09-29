import { describe, expect, it } from 'vitest'
import {
  mapInterbankingBalancesResponse,
  mapInterbankingSaldosDiarios,
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

  it('mapea el cierre diario y el saldo de hoy, en centavos', () => {
    const cuentas = mapInterbankingSaldosDiarios([
      {
        bank_number: 305,
        account_type: 'CC',
        currency: 'ARS',
        row_date: '2026-09-29T15:52:14.87',
        balances: {
          countable_balance: -1000.0,
          initial_operating_balance: -1000.0,
          current_operating_balance: -1500.0,
          projected_balance_24hs: -1000.0,
          projected_balance_48hs: -1000.0,
        },
        historical_balances: [
          {
            operation_date: '2026-09-25T00:00:00',
            day_balance: -800.0,
            total_debits: 300.0,
            total_credits: 100.0,
          },
          {
            operation_date: '2026-09-28T00:00:00',
            day_balance: -1000.0,
            total_debits: 250.0,
            total_credits: 50.0,
          },
        ],
      },
      {
        bank_number: 999,
        account_type: 'CC',
        currency: 'ARS',
        account_number: 'ajena',
        balances: { initial_operating_balance: 10, current_operating_balance: 10 },
      },
      {
        bank_number: 305,
        account_type: 'CA',
        currency: 'ARS',
        account_number: 'caja',
        balances: { initial_operating_balance: 5, current_operating_balance: 5 },
      },
    ])

    expect(cuentas).toEqual([
      {
        cuentaId: 'julio-cc',
        bancoNombre: 'Julio',
        moneda: 'ARS',
        hoy: { saldoInicioCentavos: -100_000, saldoActualCentavos: -150_000 },
        dias: [
          {
            fecha: '2026-09-25',
            saldoFinCentavos: -80_000,
            debitosCentavos: 30_000,
            creditosCentavos: 10_000,
          },
          {
            fecha: '2026-09-28',
            saldoFinCentavos: -100_000,
            debitosCentavos: 25_000,
            creditosCentavos: 5_000,
          },
        ],
      },
    ])
  })
})
