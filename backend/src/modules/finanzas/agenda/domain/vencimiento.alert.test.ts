import { describe, expect, it } from 'vitest'
import { computeVencimientoAlerta } from './vencimiento.alert.js'

describe('computeVencimientoAlerta', () => {
  const hoy = new Date('2026-09-17T15:00:00-03:00')

  it('marca vencido si la fecha pasó y sigue pendiente', () => {
    expect(
      computeVencimientoAlerta({
        fechaVencimiento: new Date('2026-09-15T12:00:00-03:00'),
        estadoPendiente: true,
        hoy,
      }),
    ).toBe('vencido')
  })

  it('marca proximo para hoy y mañana', () => {
    expect(
      computeVencimientoAlerta({
        fechaVencimiento: new Date('2026-09-17T12:00:00-03:00'),
        estadoPendiente: true,
        hoy,
      }),
    ).toBe('proximo')
    expect(
      computeVencimientoAlerta({
        fechaVencimiento: new Date('2026-09-18T12:00:00-03:00'),
        estadoPendiente: true,
        hoy,
      }),
    ).toBe('proximo')
  })

  it('neutro si ya no está pendiente', () => {
    expect(
      computeVencimientoAlerta({
        fechaVencimiento: new Date('2026-09-10T12:00:00-03:00'),
        estadoPendiente: false,
        hoy,
      }),
    ).toBe('neutro')
  })
})
