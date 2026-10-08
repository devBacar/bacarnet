import { describe, expect, it } from 'vitest'
import { esDiaHabil, habilEnODespues, habilSiguiente } from './diasHabiles.js'

describe('días hábiles del tablero', () => {
  it('salta fin de semana y feriado nacional', () => {
    // 8/10/2026 es jueves. El 10 y el 11 son finde. El 12 es feriado (Diversidad Cultural).
    expect(esDiaHabil('2026-10-09')).toBe(true)
    expect(esDiaHabil('2026-10-10')).toBe(false)
    expect(esDiaHabil('2026-10-11')).toBe(false)
    expect(esDiaHabil('2026-10-12')).toBe(false)
    expect(esDiaHabil('2026-10-13')).toBe(true)

    expect(habilSiguiente('2026-10-09')).toBe('2026-10-13')
    expect(habilSiguiente('2026-10-10')).toBe('2026-10-13')
    expect(habilEnODespues('2026-10-09')).toBe('2026-10-09')
    expect(habilEnODespues('2026-10-10')).toBe('2026-10-13')
    expect(habilEnODespues('2026-10-12')).toBe('2026-10-13')
  })
})
