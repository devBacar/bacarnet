import { describe, expect, it } from 'vitest'
import { esDiaHabil, fechaEnRangoHabil, sumarDiasHabiles, tramosDeDias } from './dias-habiles.js'

describe('días hábiles', () => {
  it('el viernes 1 de mayo de 2026 no es hábil, y el siguiente hábil es el lunes', () => {
    expect(esDiaHabil('2026-05-01')).toBe(false)
    expect(esDiaHabil('2026-05-02')).toBe(false)
    expect(sumarDiasHabiles('2026-04-30', 1)).toBe('2026-05-04')
  })

  it('cinco días hábiles después de un viernes llegan al viernes siguiente', () => {
    expect(sumarDiasHabiles('2026-09-25', 5)).toBe('2026-10-02')
    expect(fechaEnRangoHabil('2026-09-26', '2026-09-25', 0, 5)).toBe(true)
    expect(fechaEnRangoHabil('2026-09-24', '2026-09-25', 0, 5)).toBe(false)
    expect(fechaEnRangoHabil('2026-10-03', '2026-09-25', 0, 5)).toBe(false)
  })

  it('±3 días hábiles incluye el fin de semana que queda en el medio', () => {
    expect(fechaEnRangoHabil('2026-09-25', '2026-09-30', 3, 3)).toBe(true)
    expect(fechaEnRangoHabil('2026-10-05', '2026-09-30', 3, 3)).toBe(true)
    expect(fechaEnRangoHabil('2026-09-24', '2026-09-30', 3, 3)).toBe(false)
  })

  it('parte un rango largo en tramos de 60 días', () => {
    expect(tramosDeDias('2026-01-01', '2026-03-15', 60)).toEqual([
      { desde: '2026-01-01', hasta: '2026-03-01' },
      { desde: '2026-03-02', hasta: '2026-03-15' },
    ])
  })
})
