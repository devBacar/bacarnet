import type {
  BankDataProvider,
  CuentaDTO,
  SaldoDTO,
  SaldosDiariosCuentaDTO,
} from './bank-provider.types.js'

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

const DEBITOS_DIA_CENTAVOS = 8_000
const CREDITOS_DIA_CENTAVOS = 3_000
const NETO_HOY_CENTAVOS = 20_000

function sumarUnDia(fechaId: string): string {
  const [year, month, day] = fechaId.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + 1))
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fechasInclusivas(desde: string, hasta: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
    return []
  }
  const fechas: string[] = []
  let cursor = desde
  while (cursor <= hasta && fechas.length < 61) {
    fechas.push(cursor)
    cursor = sumarUnDia(cursor)
  }
  return fechas
}

export class MockBankDataProvider implements BankDataProvider {
  async getAccounts(): Promise<CuentaDTO[]> {
    return MOCK_ACCOUNTS.map((row) => ({ ...row }))
  }

  async getBalances(): Promise<SaldoDTO[]> {
    return MOCK_BALANCES.map((row) => ({ ...row }))
  }

  /**
   * Misma foto que getBalances en el saldo de ahora.
   * Cada día histórico cierra en el arranque del siguiente, y el último cierre
   * es el saldo con el que arranca hoy.
   */
  async getSaldosDiarios(input: { desde: string; hasta: string }): Promise<SaldosDiariosCuentaDTO[]> {
    const fechas = fechasInclusivas(input.desde, input.hasta)
    const historicas = fechas.slice(0, -1)
    const deltaDia = CREDITOS_DIA_CENTAVOS - DEBITOS_DIA_CENTAVOS

    return MOCK_ACCOUNTS.map((account) => {
      const actual =
        MOCK_BALANCES.find((row) => row.cuentaId === account.cuentaId)?.saldoActualCentavos ?? 0
      const saldoInicioHoy = historicas.length === 0 ? actual : actual + NETO_HOY_CENTAVOS
      let saldo = saldoInicioHoy - deltaDia * historicas.length
      const dias = historicas.map((fecha) => {
        saldo += deltaDia
        return {
          fecha,
          saldoFinCentavos: saldo,
          debitosCentavos: DEBITOS_DIA_CENTAVOS,
          creditosCentavos: CREDITOS_DIA_CENTAVOS,
        }
      })
      return {
        cuentaId: account.cuentaId,
        bancoNombre: account.bancoNombre,
        moneda: account.moneda,
        hoy: {
          saldoInicioCentavos: saldoInicioHoy,
          saldoActualCentavos: actual,
        },
        dias,
      }
    })
  }
}

export const mockBankDataProvider = new MockBankDataProvider()
