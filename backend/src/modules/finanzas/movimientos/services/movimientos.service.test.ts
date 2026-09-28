import { describe, expect, it } from 'vitest'
import { planificarRango, ventanaInicial } from './movimientos.service.js'

// 2026-09-28 12:00 Argentina (UTC-3)
const now = new Date('2026-09-28T15:00:00Z')

describe('planificarRango', () => {
  it('sin marca de agua hace la carga inicial de 90 días hasta ayer', () => {
    expect(ventanaInicial(now)).toEqual({ dateSince: '2026-06-30', dateUntil: '2026-09-27' })
    expect(planificarRango({ ultimaFechaSincronizada: null, now })).toEqual({
      modo: 'inicial',
      desde: '2026-06-30',
      hasta: '2026-09-27',
    })
  })

  it('con marca de agua vuelve a traer ese día entero y sigue hasta ayer', () => {
    expect(planificarRango({ ultimaFechaSincronizada: '2026-09-24', now })).toEqual({
      modo: 'incremental',
      desde: '2026-09-24',
      hasta: '2026-09-27',
    })
  })

  it('si la marca ya es ayer no pide nada', () => {
    expect(planificarRango({ ultimaFechaSincronizada: '2026-09-27', now })).toEqual({
      modo: 'al_dia',
      desde: null,
      hasta: null,
    })
  })
})
