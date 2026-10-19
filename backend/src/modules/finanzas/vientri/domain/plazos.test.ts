import { describe, expect, it } from 'vitest'
import type { FilaCsv } from './csv.js'
import { calcularPlazos, plazoPara } from './plazos.js'

const HOY = '2026-10-19T02:00:00'

function cmp(id: number, tipo: string, persona: number, fecha: string, pendiente = '0', baja = '0'): FilaCsv {
  return { vientri_id: String(id), nom_tipo: tipo, id_persona: String(persona), fecha: `${fecha}T00:00:00`, importe_pendiente: pendiente, baja }
}
function apl(recibo: number, factura: number, baja = '0'): FilaCsv {
  return { vientri_id: '0', id_cmp: String(recibo), id_cmp_cancelado: String(factura), baja }
}

describe('calcularPlazos', () => {
  it('usa la mediana de la persona con 3 casos o más y la general para el resto', () => {
    // Persona 5 (proveedor): 10, 20 y 40 días → mediana 20.
    // Persona 6 (proveedor): solo 2 casos → usa la general.
    const comprobantes = [
      cmp(1, 'FCG', 5, '2026-01-01'), cmp(2, 'FCG', 5, '2026-02-01'), cmp(3, 'FCG', 5, '2026-03-01'),
      cmp(4, 'FCG', 6, '2026-04-01'), cmp(5, 'FCG', 6, '2026-05-01'),
      cmp(101, 'ORP', 5, '2026-01-11'), cmp(102, 'ORP', 5, '2026-02-21'), cmp(103, 'ORP', 5, '2026-04-10'),
      cmp(104, 'ORP', 6, '2026-04-06'), cmp(105, 'ORP', 6, '2026-05-06'),
    ]
    const aplicaciones = [apl(101, 1), apl(102, 2), apl(103, 3), apl(104, 4), apl(105, 5)]
    const p = calcularPlazos(comprobantes, aplicaciones, HOY)
    expect(p.porPersona.pagar.get(5)).toBe(20)
    expect(p.porPersona.pagar.has(6)).toBe(false)
    // Todas las demoras: 10, 20, 40, 5, 5 → mediana 10.
    expect(p.general.pagar).toBe(10)
    expect(plazoPara(p, 'pagar', 5)).toEqual({ dias: 20, origen: 'historia' })
    expect(plazoPara(p, 'pagar', 6)).toEqual({ dias: 10, origen: 'general' })
    expect(plazoPara(p, 'pagar', null)).toEqual({ dias: 10, origen: 'general' })
  })

  it('sin historia usa 30 días', () => {
    const p = calcularPlazos([], [], HOY)
    expect(p.general).toEqual({ pagar: 30, cobrar: 30 })
    expect(plazoPara(p, 'cobrar', 9)).toEqual({ dias: 30, origen: 'general' })
  })

  it('ignora lo no cancelado, lo dado de baja y lo de más de 24 meses', () => {
    const comprobantes = [
      cmp(1, 'FAA', 7, '2026-01-01', '500.00'), // con saldo
      cmp(2, 'FAA', 7, '2026-01-01', '0', '1'), // de baja
      cmp(3, 'FAA', 7, '2024-01-01'), // muy vieja
      cmp(4, 'FAA', 7, '2026-01-01'), // sin aplicación
      cmp(5, 'FAA', 7, '2026-01-01'), // pago con aplicación de baja
      cmp(6, 'FAA', 7, '2026-01-01'), // válida: 15 días
      cmp(101, 'REC', 7, '2026-02-01'), cmp(102, 'REC', 7, '2026-02-01'), cmp(103, 'REC', 7, '2024-02-01'),
      cmp(104, 'REC', 7, '2026-01-16'),
    ]
    const aplicaciones = [apl(101, 1), apl(102, 2), apl(103, 3), apl(101, 5, '1'), apl(104, 6)]
    const p = calcularPlazos(comprobantes, aplicaciones, HOY)
    expect(p.general.cobrar).toBe(15)
    expect(p.porPersona.cobrar.size).toBe(0)
  })

  it('toma la fecha del último pago cuando hay varios', () => {
    const comprobantes = [cmp(1, 'FAB', 8, '2026-01-01'), cmp(101, 'REC', 8, '2026-01-11'), cmp(102, 'REC', 8, '2026-01-31')]
    const p = calcularPlazos(comprobantes, [apl(101, 1), apl(102, 1)], HOY)
    expect(p.general.cobrar).toBe(30)
  })

  it('la demora nunca es negativa', () => {
    const comprobantes = [cmp(1, 'FAB', 8, '2026-03-10'), cmp(101, 'REC', 8, '2026-03-01')]
    expect(calcularPlazos(comprobantes, [apl(101, 1)], HOY).general.cobrar).toBe(0)
  })
})
