import { describe, expect, it } from 'vitest'
import { planAgendaCuotas, type CompromisoExistente, type InversionParaAgenda } from './agenda-plan.js'
import type { Cuota } from './inversion.types.js'

function cuota(numero: number, total: number): Cuota {
  return {
    numero,
    tipo: 'normal',
    fechaVencimiento: `2026-0${numero}-10`,
    diasPeriodo: 30,
    tasaAplicadaPct: 0,
    capitalCentavos: total,
    interesCentavos: 0,
    ajusteCentavos: 0,
    penalidadCentavos: 0,
    totalCentavos: total,
    saldoCapitalCentavos: 0,
    estimada: false,
  }
}

const inv = (cronograma: Cuota[], version: number): InversionParaAgenda => ({
  id: 'x',
  numero: 'INV-0001',
  inversorNombre: 'Perez Ana',
  moneda: 'ARS',
  estado: 'vigente',
  cronograma,
  versionCronograma: version,
  mediosDevolucion: ['transferencia_ars'],
  capitalCentavos: 300,
  fechaAlta: '2026-01-10',
  ingresos: [],
  renovacionDe: null,
})

const existente = (id: string, monto: number, pagado: number, estado = 'pendiente'): CompromisoExistente => ({
  id,
  estado,
  montoCentavos: monto,
  pagadoCentavos: pagado,
  versionCronograma: 1,
})

describe('planAgendaCuotas: las cuotas con pagos no se tocan', () => {
  it('no anula una cuota con pagos que quedó afuera: avisa', () => {
    const ops = planAgendaCuotas(inv([cuota(1, 100)], 2), [existente('inv-x-c1', 100, 0), existente('inv-x-c2', 100, 40)])
    expect(ops).toContainEqual(expect.objectContaining({ tipo: 'conflicto', id: 'inv-x-c2' }))
    expect(ops.some((o) => o.tipo === 'anular' && o.id === 'inv-x-c2')).toBe(false)
  })

  it('no cambia el importe de una cuota pagada o parcial: avisa', () => {
    const ops = planAgendaCuotas(inv([cuota(1, 150), cuota(2, 150)], 2), [
      existente('inv-x-c1', 100, 100, 'pagado'),
      existente('inv-x-c2', 100, 30),
    ])
    expect(ops.filter((o) => o.tipo === 'actualizar')).toHaveLength(0)
    expect(ops.filter((o) => o.tipo === 'conflicto').map((o) => o.id)).toEqual(['inv-x-c1', 'inv-x-c2'])
  })

  it('una cuota sin pagos sí se actualiza o se anula', () => {
    const ops = planAgendaCuotas(inv([cuota(1, 150)], 2), [existente('inv-x-c1', 100, 0), existente('inv-x-c2', 100, 0)])
    expect(ops).toEqual([
      expect.objectContaining({ tipo: 'actualizar', id: 'inv-x-c1' }),
      { tipo: 'anular', id: 'inv-x-c2' },
    ])
  })
})
