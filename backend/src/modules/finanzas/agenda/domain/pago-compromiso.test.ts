import { describe, expect, it } from 'vitest'
import {
  acumuladoDePagos,
  decidirPagoCompromiso,
  estadoTrasEditarImporte,
  leerMontoSolicitado,
  pagadoLegacyCompleto,
  resolverMontoPago,
  restanteAPagarCentavos,
} from './pago-compromiso.js'

const pago = {
  fecha: '2026-09-10',
  medio: 'efectivo' as const,
  referenciaId: null,
  registradoPor: 'ana',
  registradoAt: '2026-09-10T15:00:00.000Z',
}

describe('pago parcial de un compromiso', () => {
  const actual = { estado: 'pendiente' as const, montoCentavos: 10_000, pagos: [] }

  it('sin monto paga lo que falta y lo deja pagado', () => {
    const decision = decidirPagoCompromiso(actual, { ...pago, montoSolicitado: null })
    expect(decision.tipo).toBe('aplicado')
    if (decision.tipo !== 'aplicado') return
    expect(decision.completo).toBe(true)
    expect(decision.estado).toBe('pagado')
    expect(decision.montoCentavos).toBe(10_000)
    expect(decision.acumuladoCentavos).toBe(10_000)
  })

  it('un monto menor lo deja pendiente con el acumulado', () => {
    const decision = decidirPagoCompromiso(actual, { ...pago, montoSolicitado: 4_000 })
    expect(decision.tipo).toBe('aplicado')
    if (decision.tipo !== 'aplicado') return
    expect(decision.completo).toBe(false)
    expect(decision.estado).toBe('pendiente')
    expect(decision.acumuladoCentavos).toBe(4_000)
    expect(restanteAPagarCentavos({ ...actual, pagos: decision.pagos })).toBe(6_000)
  })

  it('el segundo pago cierra cuando llega al importe', () => {
    const primero = decidirPagoCompromiso(actual, { ...pago, montoSolicitado: 4_000 })
    if (primero.tipo !== 'aplicado') throw new Error('esperado aplicado')
    const segundo = decidirPagoCompromiso(
      { ...actual, pagos: primero.pagos },
      { ...pago, fecha: '2026-09-20', montoSolicitado: null },
    )
    expect(segundo.tipo).toBe('aplicado')
    if (segundo.tipo !== 'aplicado') return
    expect(segundo.completo).toBe(true)
    expect(segundo.montoCentavos).toBe(6_000)
    expect(segundo.pagos).toHaveLength(2)
  })

  it('rechaza un monto mayor a lo que falta', () => {
    expect(() => resolverMontoPago(6_000, 6_001)).toThrow(/supera/)
  })

  it('un pagado viejo sin pagos no acepta otro pago', () => {
    const decision = decidirPagoCompromiso(
      { estado: 'pagado', montoCentavos: 10_000, pagos: [] },
      { ...pago, montoSolicitado: null },
    )
    expect(decision.tipo).toBe('ya_pagado')
    expect(pagadoLegacyCompleto({ estado: 'pagado', pagos: [] })).toBe(true)
    expect(restanteAPagarCentavos({ estado: 'pagado', montoCentavos: 10_000, pagos: [] })).toBe(0)
  })

  it('suma los pagos y lee el monto pedido', () => {
    expect(acumuladoDePagos([{ montoCentavos: 100 }, { montoCentavos: 50 }])).toBe(150)
    expect(leerMontoSolicitado(undefined)).toBeNull()
    expect(leerMontoSolicitado(250)).toBe(250)
    expect(() => leerMontoSolicitado(1.5)).toThrow(/mayor a cero/)
  })
})

describe('estadoTrasEditarImporte', () => {
  it('reabre un pagado si el importe nuevo supera lo ya pagado', () => {
    const resultado = estadoTrasEditarImporte({
      estado: 'pagado',
      pagos: [{ ...pago, montoCentavos: 4_000 }],
      montoNuevo: 9_000,
    })
    expect(resultado).toEqual({ estado: 'pendiente', reabre: true })
  })

  it('no reabre un pagado viejo sin detalle de pagos', () => {
    expect(
      estadoTrasEditarImporte({ estado: 'pagado', pagos: [], montoNuevo: 9_000 }),
    ).toEqual({ estado: 'pagado', reabre: false })
  })

  it('no deja bajar el importe por debajo de lo pagado', () => {
    expect(() =>
      estadoTrasEditarImporte({
        estado: 'pendiente',
        pagos: [{ ...pago, montoCentavos: 4_000 }],
        montoNuevo: 3_000,
      }),
    ).toThrow(/ya pagado/)
  })
})
