import { describe, expect, it } from 'vitest'
import { armarCalendario, feriadosDelMes, feriadosNacionales, pascua } from './calendarioFeriados.js'

describe('Pascua y feriados nacionales', () => {
  it('calcula el domingo de Pascua', () => {
    expect(pascua(2027)).toBe('2027-03-28')
    expect(pascua(2028)).toBe('2028-04-16')
    expect(pascua(2029)).toBe('2029-04-01')
  })

  it('arma Carnaval, Viernes Santo y los trasladables de 2027', () => {
    const f = feriadosNacionales(2027)
    expect(f['2027-02-08']).toBe('Carnaval')
    expect(f['2027-02-09']).toBe('Carnaval')
    expect(f['2027-03-26']).toBe('Viernes Santo')
    expect(f['2027-06-21']).toBe('Güemes (trasladable)')
    expect(f['2027-06-17']).toBeUndefined()
    expect(f['2027-08-16']).toBe('San Martín (trasladable)')
    expect(f['2027-10-11']).toBe('Diversidad Cultural (trasladable)')
    expect(f['2027-11-20']).toBe('Soberanía Nacional')
    expect(f['2027-01-01']).toBe('Año Nuevo')
    expect(f['2027-12-08']).toBe('Inmaculada Concepción')
  })

  it('en 2026-2027 la lista conocida pisa al cálculo y suma los días especiales', () => {
    const nov = feriadosDelMes('202611')
    expect(nov.cantidad).toBe(3)
    expect(nov.detalle[0]).toBe('9/11 Visita del Papa')
    expect(nov.origen).toBe('conocido')
    expect(feriadosDelMes('202609').cantidad).toBe(0)
  })

  it('el calendario oficial de un año reemplaza al calculado', () => {
    const cal = armarCalendario([2026, 2028], { 2026: { '2026-11-09': 'Feriado de prueba' } })
    const nov = feriadosDelMes('202611', cal)
    expect(nov.detalle).toEqual(['9/11 Feriado de prueba'])
    expect(nov.origen).toBe('oficial')
    expect(feriadosDelMes('202804', cal).detalle.some((d) => d.includes('Viernes Santo'))).toBe(true)
    expect(cal.anios['2028']['2028-04-14']?.origen).toBe('calculado')
  })
})
