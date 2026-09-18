import { describe, expect, it } from 'vitest'
import { buildMarcarPagadoHistorial } from './agenda.historial.js'

describe('buildMarcarPagadoHistorial', () => {
  it('genera entrada de historial al marcar como pagado', () => {
    const entry = buildMarcarPagadoHistorial({
      estadoAnterior: 'pendiente',
      usuario: 'uid-finanzas',
      nota: 'Transferencia Patagonia CA',
    })
    expect(entry.estadoAnterior).toBe('pendiente')
    expect(entry.estadoNuevo).toBe('pagado')
    expect(entry.usuario).toBe('uid-finanzas')
    expect(entry.estadoAnterior).not.toBe(entry.estadoNuevo)
  })

  it('rechaza historial sin usuario', () => {
    expect(() =>
      buildMarcarPagadoHistorial({
        estadoAnterior: 'vencido',
        usuario: '  ',
        nota: null,
      }),
    ).toThrow(/usuario/)
  })
})
