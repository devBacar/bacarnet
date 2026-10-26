import { describe, expect, it } from 'vitest'
import { armarChequePagoDe } from './cheque.types.js'

describe('armarChequePagoDe', () => {
  it('guarda compromiso, proveedor y concepto recortados', () => {
    expect(
      armarChequePagoDe({
        compromisoId: '  cmp-1  ',
        proveedorONombre: '  Proveedor SA  ',
        concepto: '  Alquiler octubre  ',
      }),
    ).toEqual({
      compromisoId: 'cmp-1',
      proveedorONombre: 'Proveedor SA',
      concepto: 'Alquiler octubre',
    })
  })

  it('tolera nombre o concepto ausentes sin romper cheques viejos', () => {
    expect(
      armarChequePagoDe({
        compromisoId: 'cmp-2',
        proveedorONombre: null,
        concepto: undefined,
      }),
    ).toEqual({
      compromisoId: 'cmp-2',
      proveedorONombre: '',
      concepto: '',
    })
  })
})
