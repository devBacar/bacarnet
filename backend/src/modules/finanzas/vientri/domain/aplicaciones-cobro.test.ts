import { describe, expect, it } from 'vitest'
import { armarAplicacionesCobro } from './aplicaciones-cobro.js'
import type { FilaCsv } from './csv.js'

function fila(overrides: Partial<FilaCsv>): FilaCsv {
  return { vientri_id: '1', id_cmp: '100', id_cmp_cancelado: '1', importe: '1000.00', baja: '0', fecsys: '2026-09-01T10:00:00', ...overrides }
}

describe('armarAplicacionesCobro', () => {
  it('usa la fecha del comprobante de PAGO (id_cmp), no la de la factura cancelada', () => {
    const fechas = new Map([
      [100, '2026-09-10'], // el recibo/OP
      [1, '2026-08-01'], // la factura (fecha distinta: no debe usarse)
    ])
    const [ap] = armarAplicacionesCobro([fila({})], fechas)
    expect(ap.fechaCobro).toBe('2026-09-10')
    expect(ap.idCmpPago).toBe(100)
    expect(ap.idCmpFactura).toBe(1)
    expect(ap.importeCentavos).toBe(100_000)
  })

  it('una factura con dos pagos parciales en fechas distintas: dos aplicaciones separadas', () => {
    const fechas = new Map([
      [100, '2026-09-10'],
      [101, '2026-10-05'],
      [1, '2026-08-01'],
    ])
    const filas = [
      fila({ vientri_id: '1', id_cmp: '100', id_cmp_cancelado: '1', importe: '600.00' }),
      fila({ vientri_id: '2', id_cmp: '101', id_cmp_cancelado: '1', importe: '400.00' }),
    ]
    const aplicaciones = armarAplicacionesCobro(filas, fechas)
    expect(aplicaciones).toHaveLength(2)
    expect(aplicaciones[0].fechaCobro).toBe('2026-09-10')
    expect(aplicaciones[0].importeCentavos).toBe(60_000)
    expect(aplicaciones[1].fechaCobro).toBe('2026-10-05')
    expect(aplicaciones[1].importeCentavos).toBe(40_000)
  })

  it('ignora aplicaciones dadas de baja', () => {
    const fechas = new Map([[100, '2026-09-10']])
    expect(armarAplicacionesCobro([fila({ baja: '1' })], fechas)).toHaveLength(0)
  })

  it('si no encuentra el comprobante de pago en el índice, fechaCobro queda null (no la fecha de la factura)', () => {
    const fechas = new Map([[1, '2026-08-01']]) // solo la factura, no el pago
    const [ap] = armarAplicacionesCobro([fila({})], fechas)
    expect(ap.fechaCobro).toBeNull()
  })

  it('descarta filas sin los campos mínimos', () => {
    const fechas = new Map<number, string | null>()
    expect(armarAplicacionesCobro([fila({ id_cmp: '' })], fechas)).toHaveLength(0)
    expect(armarAplicacionesCobro([fila({ importe: '' })], fechas)).toHaveLength(0)
  })
})
