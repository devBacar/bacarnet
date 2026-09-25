import { describe, expect, it } from 'vitest'
import { computeDescubiertoEstado } from './descubierto.rules.js'

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
