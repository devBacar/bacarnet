import type { BankDataProvider, CuentaDTO, SaldoDTO } from './bank-provider.types.js'

const MOCK_ACCOUNTS: CuentaDTO[] = [
  {
    cuentaId: 'patagonia-ca',
    bancoNombre: 'Patagonia',
    bancoCodigoInterbanking: 'PAT-CA-001',
    tipo: 'CA',
    moneda: 'ARS',
    descubiertoCentavos: null,
    descubiertoVigenteDesde: null,
  },
  {
    cuentaId: 'patagonia-cc',
    bancoNombre: 'Patagonia',
    bancoCodigoInterbanking: 'PAT-CC-001',
    tipo: 'CC',
    moneda: 'ARS',
    descubiertoCentavos: 1_000_000,
    descubiertoVigenteDesde: new Date('2026-01-01'),
  },
  {
    cuentaId: 'patagonia-usd',
    bancoNombre: 'Patagonia',
    bancoCodigoInterbanking: 'PAT-USD-001',
    tipo: 'USD',
    moneda: 'USD',
    descubiertoCentavos: null,
    descubiertoVigenteDesde: null,
  },
  {
    cuentaId: 'julio-ca',
    bancoNombre: 'Julio',
    bancoCodigoInterbanking: 'JUL-CA-001',
    tipo: 'CA',
    moneda: 'ARS',
    descubiertoCentavos: null,
    descubiertoVigenteDesde: null,
  },
  {
    cuentaId: 'julio-cc',
    bancoNombre: 'Julio',
    bancoCodigoInterbanking: 'JUL-CC-001',
    tipo: 'CC',
    moneda: 'ARS',
    descubiertoCentavos: 500_000,
    descubiertoVigenteDesde: new Date('2026-01-01'),
  },
  {
    cuentaId: 'julio-usd',
    bancoNombre: 'Julio',
    bancoCodigoInterbanking: 'JUL-USD-001',
    tipo: 'USD',
    moneda: 'USD',
    descubiertoCentavos: null,
    descubiertoVigenteDesde: null,
  },
  {
    cuentaId: 'cordoba-ca',
    bancoNombre: 'Córdoba',
    bancoCodigoInterbanking: 'COR-CA-001',
    tipo: 'CA',
    moneda: 'ARS',
    descubiertoCentavos: null,
    descubiertoVigenteDesde: null,
  },
  {
    cuentaId: 'cordoba-cc',
    bancoNombre: 'Córdoba',
    bancoCodigoInterbanking: 'COR-CC-001',
    tipo: 'CC',
    moneda: 'ARS',
    descubiertoCentavos: 300_000,
    descubiertoVigenteDesde: new Date('2026-01-01'),
  },
  {
    cuentaId: 'cordoba-usd',
    bancoNombre: 'Córdoba',
    bancoCodigoInterbanking: 'COR-USD-001',
    tipo: 'USD',
    moneda: 'USD',
    descubiertoCentavos: null,
    descubiertoVigenteDesde: null,
  },
]

/** Saldos simulados: CC Patagonia en negativo dentro del descubierto; CC Córdoba supera el límite. */
const MOCK_BALANCES: SaldoDTO[] = [
  { cuentaId: 'patagonia-ca', saldoActualCentavos: 12_450_000 },
  { cuentaId: 'patagonia-cc', saldoActualCentavos: -400_000 },
  { cuentaId: 'patagonia-usd', saldoActualCentavos: 128_500 },
  { cuentaId: 'julio-ca', saldoActualCentavos: 8_200_000 },
  { cuentaId: 'julio-cc', saldoActualCentavos: -450_000 },
  { cuentaId: 'julio-usd', saldoActualCentavos: 42_300 },
  { cuentaId: 'cordoba-ca', saldoActualCentavos: 1_150_000 },
  { cuentaId: 'cordoba-cc', saldoActualCentavos: -350_000 },
  { cuentaId: 'cordoba-usd', saldoActualCentavos: 9_800 },
]

export class MockBankDataProvider implements BankDataProvider {
  async getAccounts(): Promise<CuentaDTO[]> {
    return MOCK_ACCOUNTS.map((row) => ({ ...row }))
  }

  async getBalances(): Promise<SaldoDTO[]> {
    return MOCK_BALANCES.map((row) => ({ ...row }))
  }
}

export const mockBankDataProvider = new MockBankDataProvider()
