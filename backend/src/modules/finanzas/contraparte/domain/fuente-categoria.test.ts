import { describe, expect, it } from 'vitest'
import { contraparteDesdeCategoria } from './fuente-categoria.js'

describe('contraparte desde la categoría', () => {
  const categorias = new Map([
    ['com', { nombre: 'Comisiones bancarias', grupo: 'Gastos bancarios' }],
    ['cheque', { nombre: 'Impuesto al cheque', grupo: 'Impuestos' }],
    ['sellos', { nombre: 'Sellos', grupo: 'Impuestos' }],
    ['iva', { nombre: 'IVA', grupo: 'Impuestos' }],
    ['gan', { nombre: 'Ganancias', grupo: 'Impuestos' }],
    ['iibb', { nombre: 'Ingresos Brutos', grupo: 'Impuestos' }],
    ['interno', { nombre: 'Movimiento interno', grupo: 'Movimientos internos' }],
    ['sueldos', { nombre: 'Sueldos', grupo: 'Pagos' }],
    ['prove', { nombre: 'Proveedores', grupo: 'Pagos' }],
  ])

  it('arma el texto según la tabla y el banco de la cuenta', () => {
    expect(contraparteDesdeCategoria({ categoriaId: 'com', bancoNombre: 'Córdoba' }, categorias)?.nombre).toBe(
      'Banco Córdoba',
    )
    expect(contraparteDesdeCategoria({ categoriaId: 'cheque', bancoNombre: 'Julio' }, categorias)?.nombre).toBe(
      'Banco Julio',
    )
    expect(contraparteDesdeCategoria({ categoriaId: 'sellos', bancoNombre: 'Patagonia' }, categorias)?.nombre).toBe(
      'Banco Patagonia',
    )
    expect(contraparteDesdeCategoria({ categoriaId: 'iva', bancoNombre: 'Córdoba' }, categorias)?.nombre).toBe(
      'AFIP (cobrado por Banco Córdoba)',
    )
    expect(contraparteDesdeCategoria({ categoriaId: 'gan', bancoNombre: 'Córdoba' }, categorias)?.nombre).toBe(
      'AFIP (cobrado por Banco Córdoba)',
    )
    expect(contraparteDesdeCategoria({ categoriaId: 'iibb', bancoNombre: 'Córdoba' }, categorias)?.nombre).toBe(
      'Rentas (SIRCREB, cobrado por Banco Córdoba)',
    )
    expect(contraparteDesdeCategoria({ categoriaId: 'interno', bancoNombre: 'Córdoba' }, categorias)?.nombre).toBe(
      'Bacar · entre cuentas propias',
    )
    expect(contraparteDesdeCategoria({ categoriaId: 'sueldos', bancoNombre: 'Córdoba' }, categorias)?.nombre).toBe(
      'Empleados (sueldos)',
    )
  })

  it('proveedores no está en la tabla: no inventa un nombre', () => {
    expect(contraparteDesdeCategoria({ categoriaId: 'prove', bancoNombre: 'Córdoba' }, categorias)).toBeNull()
    expect(contraparteDesdeCategoria({ categoriaId: null, bancoNombre: 'Córdoba' }, categorias)).toBeNull()
  })
})
