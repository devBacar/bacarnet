import { describe, expect, it } from 'vitest'
import type { CuentaCorrienteObjetivo, InterbankingInfoSession } from '../../movimientos/adapters/interbanking-movimientos.js'
import { fetchExtracto } from './interbanking-extractos.js'

const cuenta: CuentaCorrienteObjetivo = {
  cuentaId: 'julio-cc',
  bancoNombre: 'Julio',
  bancoNumero: '305',
  numeroCuenta: '00010101000130345',
}

function session(): InterbankingInfoSession {
  return {
    client: {
      getToken: async () => 'token-test',
      getBalances: async () => ({ accounts: [] }),
    },
    clientId: 'client-test',
    customerId: 'R72668Y',
  }
}

function statement(fecha: string, amount: number, tipo: 'D' | 'C') {
  return {
    operation_date: fecha,
    opening_balance: 10.2,
    ending_balance: 110.7,
    debits_total_amount: tipo === 'D' ? amount : 0,
    credits_total_amount: tipo === 'C' ? amount : 0,
    movement_detail: [
      {
        amount,
        debit_credit_type: tipo,
        process_date: `${fecha}T11:00:00`,
        movement_date: `${fecha}T10:00:00`,
        value_date: `${fecha}T00:00:00`,
        code_description_bank: 'TRANSFERENCIA',
        code_description_ib: 'TRF',
        code_description_standard: 'TRANSFERENCIA ESTANDAR',
        operation_code_bank: '123',
        operation_code_ib: '45',
        voucher_number: 999,
        correlative_number: 7,
        depositor_description: 'ACME SA',
        customer_cuit: '30-12345678-9',
      },
    ],
  }
}

describe('adaptador de extractos', () => {
  it('parte un período de 61 días en dos consultas y no pagina de más', async () => {
    const urls: string[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input)
      urls.push(url)
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer token-test')
      expect(headers.get('client_id')).toBe('client-test')
      const fecha = new URL(url).searchParams.get('date-since') ?? '2026-01-01'
      const body = {
        general_data: { total_rows: 1, page: 0, limit: 100 },
        statements: [statement(fecha, 100.5, 'C')],
      }
      return new Response(JSON.stringify(body), { status: 200 })
    }

    const extracto = await fetchExtracto({
      cuentaId: 'julio-cc',
      desde: '2026-01-01',
      hasta: '2026-03-02',
      deps: { session: session(), cuentas: [cuenta], fetchImpl },
    })

    expect(urls).toHaveLength(2)
    const rangos = urls.map((url) => {
      const params = new URL(url).searchParams
      return {
        since: params.get('date-since'),
        until: params.get('date-until'),
        page: params.get('page'),
        customer: params.get('customer-id'),
        bank: params.get('bank-number'),
        currency: params.get('currency'),
        accountType: params.get('account-type'),
      }
    })
    expect(rangos).toEqual([
      {
        since: '2026-01-01',
        until: '2026-03-01',
        page: '0',
        customer: 'R72668Y',
        bank: '305',
        currency: 'ARS',
        accountType: 'CC',
      },
      {
        since: '2026-03-02',
        until: '2026-03-02',
        page: '0',
        customer: 'R72668Y',
        bank: '305',
        currency: 'ARS',
        accountType: 'CC',
      },
    ])
    expect(extracto.dias).toHaveLength(2)
    expect(extracto.dias[0]?.saldoAperturaCentavos).toBe(1020)
    expect(extracto.dias[0]?.movimientos[0]).toMatchObject({
      montoCentavos: 10050,
      tipo: 'credito',
      descripcion: 'TRANSFERENCIA',
      fechaProceso: '2026-01-01',
      voucherNumber: 999,
      correlativeNumber: 7,
      customerCuit: '30-12345678-9',
    })
  })

  it('sigue las páginas hasta cubrir total_rows', async () => {
    const pages: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input))
      const page = url.searchParams.get('page') ?? '0'
      pages.push(page)
      const fecha = page === '0' ? '2026-09-01' : '2026-09-02'
      return new Response(
        JSON.stringify({
          general_data: { total_rows: 2 },
          statements: [statement(fecha, 10, page === '0' ? 'D' : 'C')],
        }),
        { status: 200 },
      )
    }

    const extracto = await fetchExtracto({
      cuentaId: 'julio-cc',
      desde: '2026-09-01',
      hasta: '2026-09-02',
      deps: { session: session(), cuentas: [cuenta], fetchImpl, limit: 1 },
    })

    expect(pages).toEqual(['0', '1'])
    expect(extracto.dias.map((dia) => dia.fecha)).toEqual(['2026-09-01', '2026-09-02'])
    expect(extracto.dias[0]?.movimientos[0]?.tipo).toBe('debito')
    expect(extracto.dias[0]?.movimientos[0]?.montoCentavos).toBe(1000)
  })

  it('pagina por movimientos (no por días) y une un día partido entre páginas', async () => {
    // Como el banco: la página trae 2 días pero 2 movimientos = limit, y el 02/09 sigue en la página 1
    // con sus propios totales y un saldo final que solo cuenta ese pedazo.
    const pages: string[] = []
    const dia = (fecha: string, apertura: number, debito: number, credito: number) => ({
      operation_date: fecha,
      opening_balance: apertura,
      ending_balance: apertura + credito - debito,
      debits_total_amount: debito,
      credits_total_amount: credito,
      total_movements: 1,
      movement_detail: [
        {
          ...statement(fecha, debito || credito, debito ? 'D' : 'C').movement_detail[0],
          correlative_number: debito ? 2 : 1,
        },
      ],
    })
    const fetchImpl: typeof fetch = async (input) => {
      const page = new URL(String(input)).searchParams.get('page') ?? '0'
      pages.push(page)
      const statements =
        page === '0'
          ? [dia('2026-09-01', 100, 0, 50), dia('2026-09-02', 150, 0, 30)]
          : [dia('2026-09-02', 150, 20, 0)]
      return new Response(JSON.stringify({ general_data: { total_rows: 3 }, statements }), { status: 200 })
    }

    const extracto = await fetchExtracto({
      cuentaId: 'julio-cc',
      desde: '2026-09-01',
      hasta: '2026-09-02',
      deps: { session: session(), cuentas: [cuenta], fetchImpl, limit: 2 },
    })

    expect(pages).toEqual(['0', '1'])
    expect(extracto.dias).toHaveLength(2)
    const segundo = extracto.dias[1]!
    expect(segundo.movimientos).toHaveLength(2)
    expect(segundo.creditosCentavos).toBe(3000)
    expect(segundo.debitosCentavos).toBe(2000)
    expect(segundo.saldoAperturaCentavos).toBe(15000)
    expect(segundo.saldoCierreCentavos).toBe(16000)
  })

  it('encadena saldos cuando el banco manda una apertura que no sigue al cierre anterior', async () => {
    const fetchImpl: typeof fetch = async () => {
      const dia1 = { ...statement('2026-09-22', 10, 'C'), opening_balance: 100, ending_balance: 110 }
      // El banco informa apertura 5000 el 23/09, pero el 22/09 cerró en 110.
      const dia2 = { ...statement('2026-09-23', 5, 'D'), opening_balance: 5000, ending_balance: 4995 }
      return new Response(JSON.stringify({ general_data: { total_rows: 2 }, statements: [dia1, dia2] }), { status: 200 })
    }
    const extracto = await fetchExtracto({
      cuentaId: 'julio-cc',
      desde: '2026-09-22',
      hasta: '2026-09-23',
      deps: { session: session(), cuentas: [cuenta], fetchImpl },
    })
    expect(extracto.dias[1]?.saldoAperturaCentavos).toBe(11000)
    expect(extracto.dias[1]?.saldoCierreCentavos).toBe(10500)
  })

  it('no acepta un día que dice tener más movimientos de los que mandó', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          general_data: { total_rows: 1 },
          statements: [{ ...statement('2026-09-01', 10, 'D'), total_movements: 4 }],
        }),
        { status: 200 },
      )

    await expect(
      fetchExtracto({
        cuentaId: 'julio-cc',
        desde: '2026-09-01',
        hasta: '2026-09-01',
        deps: { session: session(), cuentas: [cuenta], fetchImpl },
      }),
    ).rejects.toThrow(/incompleto/)
  })
})
