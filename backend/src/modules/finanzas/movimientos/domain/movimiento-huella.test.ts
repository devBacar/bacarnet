import { describe, expect, it } from 'vitest'
import {
  emparejarAnotaciones,
  huellaMovimiento,
  huellaMovimientoSinDescripcion,
} from './movimiento-huella.js'

const base = {
  fechaProceso: '2026-09-25',
  tipo: 'debito',
  montoCentavos: 150000,
  descripcion: 'Impuesto',
  operationCodeBank: '500',
  operationCodeIb: 'IMP',
  voucherNumber: null,
  correlativeNumber: 12,
  depositorDescription: null,
  customerCuit: null,
}

describe('huella de movimiento', () => {
  it('cambia si cambia el monto o la descripción', () => {
    const una = huellaMovimiento(base)
    const otra = huellaMovimiento({ ...base, montoCentavos: 150001 })
    expect(otra).not.toBe(una)
    expect(huellaMovimiento({ ...base })).toBe(una)
  })

  it('reasigna la categoría a la fila equivalente y no a otra', () => {
    const huella = huellaMovimiento(base)
    const [conNota, libre] = emparejarAnotaciones(
      [base, { ...base, descripcion: 'Comisión' }],
      [{ huella, categoriaId: 'cat-1', nota: 'IIBB' }],
    )
    expect(conNota.categoriaId).toBe('cat-1')
    expect(conNota.nota).toBe('IIBB')
    expect(libre.categoriaId).toBeNull()
    expect(libre.nota).toBeNull()
  })

  it('conserva la categoría si al otro día el banco cambia solo el texto', () => {
    const delDia = { ...base, descripcion: 'IMP' }
    const [definitiva] = emparejarAnotaciones(
      [{ ...base, descripcion: 'IMPUESTO LEY 25413' }],
      [
        {
          huella: huellaMovimiento(delDia),
          huellaSinDescripcion: huellaMovimientoSinDescripcion(delDia),
          categoriaId: 'cat-imp',
          nota: 'ley cheque',
        },
      ],
    )
    expect(definitiva.categoriaId).toBe('cat-imp')
    expect(definitiva.nota).toBe('ley cheque')
  })

  it('el respaldo sin descripción no pisa una coincidencia exacta', () => {
    const exacta = { ...base, descripcion: 'A' }
    const otra = { ...base, descripcion: 'B' }
    const filas = emparejarAnotaciones(
      [exacta, otra],
      [
        {
          huella: huellaMovimiento(exacta),
          huellaSinDescripcion: huellaMovimientoSinDescripcion(exacta),
          categoriaId: 'cat-a',
          nota: null,
        },
      ],
    )
    expect(filas.map((fila) => fila.categoriaId)).toEqual(['cat-a', null])
  })

  it('si hay dos filas idénticas, la anotación no se duplica', () => {
    const huella = huellaMovimiento(base)
    const filas = emparejarAnotaciones([base, base], [{ huella, categoriaId: 'cat-1', nota: null }])
    expect(filas.map((fila) => fila.categoriaId)).toEqual(['cat-1', null])
  })
})
