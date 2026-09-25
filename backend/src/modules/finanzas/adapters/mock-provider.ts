import type { BankDataProvider, CuentaDTO, SaldoDTO } from './bank-provider.types.js'

/** Mock alineado a Interbanking real: solo cuentas corrientes en ARS (sin CA ni USD en sync). */
const MOCK_ACCOUNTS: CuentaDTO[] = [
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
    cuentaId: 'julio-cc',
    bancoNombre: 'Julio',
    bancoCodigoInterbanking: 'JUL-CC-001',
    tipo: 'CC',
    moneda: 'ARS',
    descubiertoCentavos: 500_000,
    descubiertoVigenteDesde: new Date('2026-01-01'),
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
]

const MOCK_BALANCES: SaldoDTO[] = [
  { cuentaId: 'patagonia-cc', saldoActualCentavos: -400_000 },
  { cuentaId: 'julio-cc', saldoActualCentavos: -450_000 },
  { cuentaId: 'cordoba-cc', saldoActualCentavos: -350_000 },
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
