import { describe, expect, it } from 'vitest'
import { esInteresFinancieroDisfrazado } from './clasificar-cheque-proveedor.js'

// Nombres inventados: no usar datos reales en fixtures.
const financieros = new Set(['prestamista uno', 'cambista dos', 'cuñado x'.normalize('NFD').replace(/[̀-ͯ]/g, '')])

describe('esInteresFinancieroDisfrazado', () => {
  it('marca interés encubierto si el beneficiario es financiero', () => {
    const r = esInteresFinancieroDisfrazado('PRESTAMISTA UNO', financieros)
    expect(r).toEqual({ esInteresEncubierto: true, beneficiarioReal: 'PRESTAMISTA UNO' })
  })

  it('ignora mayúsculas, acentos y espacios de más', () => {
    const r = esInteresFinancieroDisfrazado('  Cámbista   Dos ', financieros)
    expect(r.esInteresEncubierto).toBe(true)
  })

  it('no marca un proveedor real', () => {
    const r = esInteresFinancieroDisfrazado('FERRETERIA EJEMPLO SA', financieros)
    expect(r).toEqual({ esInteresEncubierto: false, beneficiarioReal: null })
  })

  it('no marca coincidencias parciales', () => {
    const r = esInteresFinancieroDisfrazado('PRESTAMISTA UNO SRL', financieros)
    expect(r.esInteresEncubierto).toBe(false)
  })

  it('beneficiario vacío o nulo no es interés encubierto', () => {
    expect(esInteresFinancieroDisfrazado('', financieros).esInteresEncubierto).toBe(false)
    expect(esInteresFinancieroDisfrazado(null, financieros).esInteresEncubierto).toBe(false)
    expect(esInteresFinancieroDisfrazado(undefined, financieros).beneficiarioReal).toBeNull()
  })

  it('con lista de financieros vacía nunca marca', () => {
    expect(esInteresFinancieroDisfrazado('PRESTAMISTA UNO', new Set()).esInteresEncubierto).toBe(false)
  })
})
