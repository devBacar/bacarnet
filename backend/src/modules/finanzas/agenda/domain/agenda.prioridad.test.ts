import { describe, expect, it } from 'vitest'
import { compareAgendaByUrgenciaThenFecha, urgenciaSortRank } from './agenda.prioridad.js'

describe('urgenciaSortRank', () => {
  it('ordena Alta antes que sin urgencia', () => {
    expect(urgenciaSortRank('alta')).toBeLessThan(urgenciaSortRank(null))
  })
})

describe('compareAgendaByUrgenciaThenFecha', () => {
  it('misma urgencia: vence antes primero', () => {
    expect(compareAgendaByUrgenciaThenFecha(null, 100, null, 200)).toBeLessThan(0)
  })

  it('Alta vence después que sin urgencia que vence antes', () => {
    expect(compareAgendaByUrgenciaThenFecha('alta', 500, null, 100)).toBeLessThan(0)
  })
})
