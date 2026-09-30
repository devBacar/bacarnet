import { beforeEach, describe, expect, it, vi } from 'vitest'
import { transferenciasIbPorDia, vaciarCacheTransferenciasIb } from './cache-transferencias-ib.js'
import type { TransferenciaIbRecibida } from '../domain/fuente-interbanking.js'

function fila(fecha: string): TransferenciaIbRecibida {
  return {
    id: `ib-${fecha}`,
    fecha,
    montoCentavos: 100,
    cuentaCreditoNumero: '1',
    bancoCreditoNumero: '020',
    nombrePagador: 'Alguien',
    cuitPagador: null,
    estado: 'Ejecutada',
    cuentaDebitoNumero: '', bancoDebitoNumero: '', nombreBeneficiario: null, cuitBeneficiario: null, bancoCreditoNombre: null, cuentasPropias: false,
  }
}

describe('cache de transferencias de Interbanking', () => {
  beforeEach(() => vaciarCacheTransferenciasIb())

  it('no vuelve a pedir un día que ya trajo', async () => {
    const fetchRango = vi.fn(async (desde: string) => [fila(desde)])
    const primero = await transferenciasIbPorDia({
      desde: '2026-09-01',
      hasta: '2026-09-01',
      hoy: '2026-09-28',
      now: 1_000,
      fetchRango,
    })
    const segundo = await transferenciasIbPorDia({
      desde: '2026-09-01',
      hasta: '2026-09-01',
      hoy: '2026-09-28',
      now: 2_000,
      fetchRango,
    })
    expect(fetchRango).toHaveBeenCalledTimes(1)
    expect(primero).toEqual([fila('2026-09-01')])
    expect(segundo).toEqual(primero)
  })
})
