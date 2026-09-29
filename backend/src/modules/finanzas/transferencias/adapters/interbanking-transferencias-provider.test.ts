import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { InterbankingTransferenciasProvider } from './interbanking-transferencias-provider.js'

const { getCuentaDocument } = vi.hoisted(() => ({ getCuentaDocument: vi.fn() }))
vi.mock('../../services/cuentas.repository.js', () => ({ getCuentaDocument }))

const item = {
  tipo: 'cuentas_propias' as const,
  cuentaDebitoId: 'patagonia-cc',
  cuentaCreditoCbu: '3050001101010001303450',
  montoCentavos: 100,
  concepto: null,
  disclaimerAceptado: null,
}

describe('InterbankingTransferenciasProvider.confeccionarLote', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv('INTERBANKING_TRANSFER_CLIENT_ID', 'test-client')
    vi.stubEnv('INTERBANKING_TRANSFER_CLIENT_SECRET', 'test-secret')
    vi.stubEnv('INTERBANKING_TRANSFER_REDIRECT_URL', 'https://localhost/callback')
    vi.stubEnv('INTERBANKING_TRANSFER_CUSTOMER_ID', 'test-customer')
    vi.stubEnv('INTERBANKING_TRANSFER_USUARIO', 'test-user')
    vi.stubEnv('INTERBANKING_TRANSFER_CLAVE', 'test-clave')
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
    getCuentaDocument.mockReset()
  })

  it.each([undefined, '', 'false', 'TRUE', '1'])(
    'con INTERBANKING_TRANSFER_ALLOW_REAL=%j rechaza sin llamar a Interbanking',
    async (value) => {
      if (value === undefined) delete process.env.INTERBANKING_TRANSFER_ALLOW_REAL
      else vi.stubEnv('INTERBANKING_TRANSFER_ALLOW_REAL', value)

      const provider = new InterbankingTransferenciasProvider()
      await expect(provider.confeccionarLote([item])).rejects.toThrow(
        'Transferencias reales deshabilitadas: falta INTERBANKING_TRANSFER_ALLOW_REAL=true',
      )
      expect(fetchMock).not.toHaveBeenCalled()
      expect(getCuentaDocument).not.toHaveBeenCalled()
    },
  )

  it('los caminos directos al POST también rechazan sin la variable', async () => {
    delete process.env.INTERBANKING_TRANSFER_ALLOW_REAL
    vi.stubEnv('INTERBANKING_TRANSFER_OPERATOR_ID_NUMBER', '12345678')
    const provider = new InterbankingTransferenciasProvider()
    const account = {
      bank_number: '034',
      account_type: 'CC' as const,
      currency: 'ARS' as const,
      account_number: '1',
    }

    await expect(provider.postConfeccionV2('cuentas_propias', {})).rejects.toThrow(
      'Transferencias reales deshabilitadas',
    )
    await expect(
      provider.confeccionarCuentasPropiasV2({
        confectionId: '1',
        requestDate: '2026-09-29',
        amountPesosString: '1.00',
        debit: account,
        credit: account,
      }),
    ).rejects.toThrow('Transferencias reales deshabilitadas')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
