import { describe, expect, it } from 'vitest'
import { computeDescubiertoEstado, parseDescubiertoManual } from './descubierto.rules.js'

describe('computeDescubiertoEstado', () => {
  const descubierto = 10_000_00 // ARS 10.000,00

  it('no aplica a cuentas que no son CC', () => {
    expect(computeDescubiertoEstado(-500_00, descubierto, 'USD')).toEqual({
      porcentajeUsado: null,
      semaforo: null,
      superado: null,
    })
  })

  it('sin límite de descubierto cargado → superado null', () => {
    expect(computeDescubiertoEstado(-500_00, null, 'CC')).toEqual({
      porcentajeUsado: null,
      semaforo: null,
      superado: null,
    })
  })

  it('saldo positivo en CC → 0 % verde', () => {
    expect(computeDescubiertoEstado(1_000_00, descubierto, 'CC')).toEqual({
      porcentajeUsado: 0,
      semaforo: 'verde',
      superado: false,
    })
  })

  it('40 % usado → verde', () => {
    expect(computeDescubiertoEstado(-4_000_00, descubierto, 'CC')).toEqual({
      porcentajeUsado: 40,
      semaforo: 'verde',
      superado: false,
    })
  })

  it('60 % usado → verde (límite superior verde)', () => {
    expect(computeDescubiertoEstado(-6_000_00, descubierto, 'CC')).toEqual({
      porcentajeUsado: 60,
      semaforo: 'verde',
      superado: false,
    })
  })

  it('75 % usado → amarillo', () => {
    expect(computeDescubiertoEstado(-7_500_00, descubierto, 'CC')).toEqual({
      porcentajeUsado: 75,
      semaforo: 'amarillo',
      superado: false,
    })
  })

  it('90 % usado → amarillo (límite superior amarillo)', () => {
    expect(computeDescubiertoEstado(-9_000_00, descubierto, 'CC')).toEqual({
      porcentajeUsado: 90,
      semaforo: 'amarillo',
      superado: false,
    })
  })

  it('95 % usado → rojo', () => {
    expect(computeDescubiertoEstado(-9_500_00, descubierto, 'CC')).toEqual({
      porcentajeUsado: 95,
      semaforo: 'rojo',
      superado: false,
    })
  })

  it('supera el descubierto → rojo y superado', () => {
    expect(computeDescubiertoEstado(-12_000_00, descubierto, 'CC')).toEqual({
      porcentajeUsado: 120,
      semaforo: 'rojo',
      superado: true,
    })
  })
})

describe('parseDescubiertoManual', () => {
  const hoy = new Date('2026-09-29T15:00:00-03:00')

  it('acepta monto y fecha del acuerdo (medianoche Argentina)', () => {
    const r = parseDescubiertoManual({ descubiertoCentavos: 50_000_000_00, vigenteDesde: '2026-09-01' }, hoy)
    expect(r.descubiertoCentavos).toBe(50_000_000_00)
    expect(r.vigenteDesde?.toISOString()).toBe('2026-09-01T03:00:00.000Z')
  })

  it('null o 0 quitan el acuerdo y la fecha', () => {
    expect(parseDescubiertoManual({ descubiertoCentavos: null, vigenteDesde: '2026-09-01' }, hoy)).toEqual({
      descubiertoCentavos: null,
      vigenteDesde: null,
    })
    expect(parseDescubiertoManual({ descubiertoCentavos: 0 }, hoy).descubiertoCentavos).toBeNull()
  })

  it('rechaza montos negativos, no numéricos o faltantes', () => {
    expect(() => parseDescubiertoManual({ descubiertoCentavos: -1 }, hoy)).toThrow(/positivo/)
    expect(() => parseDescubiertoManual({ descubiertoCentavos: '1000' }, hoy)).toThrow()
    expect(() => parseDescubiertoManual({}, hoy)).toThrow()
  })

  it('rechaza fechas inválidas o futuras', () => {
    expect(() => parseDescubiertoManual({ descubiertoCentavos: 100, vigenteDesde: '2026-02-30' }, hoy)).toThrow()
    expect(() => parseDescubiertoManual({ descubiertoCentavos: 100, vigenteDesde: '01/09/2026' }, hoy)).toThrow()
    expect(() => parseDescubiertoManual({ descubiertoCentavos: 100, vigenteDesde: '2026-10-01' }, hoy)).toThrow(
      /futura/,
    )
  })
})
