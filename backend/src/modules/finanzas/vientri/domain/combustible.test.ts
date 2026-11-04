import { describe, expect, it } from 'vitest'
import { armarComprasCombustible } from './combustible.js'
import type { FilaCsv } from './csv.js'

const monedas = new Map<number, string>([[1, 'ARS']])

function fila(p: Partial<Record<string, string>>): FilaCsv {
  return {
    vientri_id: '1', nom_tipo: 'FAA', fecha: '2025-06-10', id_proveedor: '100', nombre_proveedor: 'ESTACION X',
    total: '1000.00', id_divisa: '1', id_unegocio: '2', baja: '0', fecsys: '2025-06-10T10:00:00', ...p,
  }
}

describe('armarComprasCombustible', () => {
  it('arma una factura con el signo positivo', () => {
    const [doc] = armarComprasCombustible([fila({})], monedas)
    expect(doc.totalCentavos).toBe(100_000)
    expect(doc.moneda).toBe('ARS')
    expect(doc.idUnegocio).toBe(2)
  })

  it('resta el total de una nota de crédito', () => {
    const [doc] = armarComprasCombustible([fila({ nom_tipo: 'NCG', total: '500.00' })], monedas)
    expect(doc.totalCentavos).toBe(-50_000)
  })

  it('ignora filas dadas de baja', () => {
    const salida = armarComprasCombustible([fila({ baja: '1' })], monedas)
    expect(salida).toHaveLength(0)
  })

  it('ignora filas sin vientri_id', () => {
    const salida = armarComprasCombustible([fila({ vientri_id: '' })], monedas)
    expect(salida).toHaveLength(0)
  })

  it('toma el total como absoluto aunque venga negativo en el CSV', () => {
    const [doc] = armarComprasCombustible([fila({ nom_tipo: 'NCG', total: '-500.00' })], monedas)
    expect(doc.totalCentavos).toBe(-50_000)
  })
})
