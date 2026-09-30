import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  acotarRangoConsulta,
  buildTransfersDetailsUrl,
  consultarDetallesTransferencias,
  parseTransfersDetailsResponse,
  ventanasDeConsulta,
  type DetalleTransferenciaInterbanking,
} from './interbanking-transferencias-details.js'
import type { InterbankingInfoSession } from '../../movimientos/adapters/interbanking-movimientos.js'

const session = {
  client: { getToken: async () => 'token-test', getBalances: async () => ({ accounts: [] }) },
  clientId: 'client-test',
  customerId: 'I02346W',
} as InterbankingInfoSession

describe('consulta de detalles de transferencias', () => {
  it('arma la URL con los parámetros obligatorios y no confecciona', () => {
    const url = new URL(
      buildTransfersDetailsUrl({
        customerId: 'I02346W',
        dateSince: '2026-09-01',
        dateUntil: '2026-09-29',
        page: 0,
      }),
    )
    expect(url.pathname).toBe('/api/prod/v1/transfers/details')
    expect(url.searchParams.get('customer-id')).toBe('I02346W')
    expect(url.searchParams.get('date-since')).toBe('2026-09-01')
    expect(url.searchParams.get('date-until')).toBe('2026-09-29')
    expect(url.searchParams.get('page')).toBe('0')

    const src = readFileSync(
      join(process.cwd(), 'src/modules/finanzas/transferencias/adapters/interbanking-transferencias-details.ts'),
      'utf8',
    )
    expect(src).not.toMatch(/ALLOW_REAL/)
    expect(src).not.toMatch(/confection/i)
    expect(src).not.toMatch(/method:\s*'POST'/)
  })

  it('parte el rango en ventanas de 60 días y no pasa de 180', () => {
    expect(ventanasDeConsulta('2026-01-01', '2026-03-31')).toEqual([
      { desde: '2026-01-01', hasta: '2026-03-01' },
      { desde: '2026-03-02', hasta: '2026-03-31' },
    ])
    expect(acotarRangoConsulta('2025-01-01', '2026-09-29', '2026-09-29')).toEqual({
      desde: '2026-04-03',
      hasta: '2026-09-29',
    })
    expect(acotarRangoConsulta('2025-01-01', '2025-02-01', '2026-09-29')).toBeNull()
  })

  it('lee status, cuentas, monto y fecha sin salir a la red', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const page = new URL(url).searchParams.get('page')
      const body =
        page === '0'
          ? {
              general_data: { total_rows: 1, page: 0, limit: 100 },
              transfers: [
                {
                  transfer_id: 445566,
                  transaction_number: 9,
                  request_date: '2026-09-29T11:00:00',
                  amount: 1500.5,
                  reference_number: 'OP-1',
                  payment_number: 'P-9',
                  status: 'En autorización',
                  comments: 'confection-1',
                  debit_account: { account_cbu: '0340070800700370037009', account_number: '20', bank_number: '034' },
                  credit_account: { account_cbu: '3050001101010001303450', account_number: '45' },
                },
              ],
            }
          : { general_data: { total_rows: 1 }, transfers: [] }
      return new Response(JSON.stringify(body), { status: 200 })
    })

    const rows = await consultarDetallesTransferencias({
      dateSince: '2026-09-01',
      dateUntil: '2026-09-29',
      now: new Date('2026-09-29T15:00:00.000Z'),
      session,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const llamada = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(llamada[1]?.method).toBe('GET')
    expect(rows).toEqual<DetalleTransferenciaInterbanking[]>([
      {
        transferId: '445566',
        transactionNumber: '9',
        referenceNumber: 'OP-1',
        paymentNumber: 'P-9',
        lotNumber: null,
        comments: 'confection-1',
        status: 'En autorización',
        amountCentavos: 150050,
        requestDate: '2026-09-29',
        debitCbu: '0340070800700370037009',
        debitAccountNumber: '20',
        debitBankNumber: '034',
        creditCbu: '3050001101010001303450',
        creditAccountNumber: '45',
      },
    ])
    expect(parseTransfersDetailsResponse({ transfers: [{ amount: 1 }] }).transfers).toEqual([])
  })
})
