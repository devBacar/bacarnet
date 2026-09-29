import { describe, expect, it } from 'vitest'
import {
  debePasarMovimientoACuit,
  decidirReglaClaveSemilla,
  decidirReglaDescripcionSemilla,
  motivoCategoriaMantenida,
} from './semilla-decision.js'

describe('decidirReglaDescripcionSemilla', () => {
  const base = { categoriaSemillaId: 'iva', reemplazaA: ['Impuestos', 'Comisiones bancarias'] }

  it('crea si no hay regla', () => {
    expect(decidirReglaDescripcionSemilla({ ...base, regla: null, categoriaActualNombre: null })).toEqual({
      accion: 'crear',
    })
  })

  it('no hace nada si ya apunta a la categoría de la semilla', () => {
    expect(
      decidirReglaDescripcionSemilla({
        ...base,
        regla: { categoriaId: 'iva' },
        categoriaActualNombre: 'IVA',
      }),
    ).toEqual({ accion: 'mantener' })
  })

  it('mueve si el nombre actual está en reemplazaA', () => {
    expect(
      decidirReglaDescripcionSemilla({
        ...base,
        regla: { categoriaId: 'viejos-impuestos' },
        categoriaActualNombre: 'impuestos',
      }),
    ).toEqual({ accion: 'mover', categoriaActualNombre: 'impuestos' })
  })

  it('respeta una categoría que eligió el líder', () => {
    expect(
      decidirReglaDescripcionSemilla({
        ...base,
        regla: { categoriaId: 'manual' },
        categoriaActualNombre: 'Sueldos',
      }),
    ).toEqual({ accion: 'respetar', categoriaActualNombre: 'Sueldos' })
  })
})

describe('decidirReglaClaveSemilla', () => {
  it('crea, mantiene o respeta, sin mover por reemplazaA', () => {
    expect(
      decidirReglaClaveSemilla({ regla: null, categoriaSemillaId: 'com', categoriaActualNombre: null }),
    ).toEqual({ accion: 'crear' })
    expect(
      decidirReglaClaveSemilla({
        regla: { categoriaId: 'com' },
        categoriaSemillaId: 'com',
        categoriaActualNombre: 'Comisiones bancarias',
      }),
    ).toEqual({ accion: 'mantener' })
    expect(
      decidirReglaClaveSemilla({
        regla: { categoriaId: 'otra' },
        categoriaSemillaId: 'com',
        categoriaActualNombre: 'Sueldos',
      }),
    ).toEqual({ accion: 'respetar', categoriaActualNombre: 'Sueldos' })
  })
})

describe('debePasarMovimientoACuit', () => {
  it('toma los vacíos y los que puso una regla de texto, y deja la categoría manual', () => {
    expect(
      debePasarMovimientoACuit({ categoriaId: null, categoriaPorTextoOCodigo: 'cobros', categoriaCuitId: 'interno' }),
    ).toBe(true)
    expect(
      debePasarMovimientoACuit({
        categoriaId: 'cobros',
        categoriaPorTextoOCodigo: 'cobros',
        categoriaCuitId: 'interno',
      }),
    ).toBe(true)
    expect(
      debePasarMovimientoACuit({
        categoriaId: 'interno',
        categoriaPorTextoOCodigo: 'cobros',
        categoriaCuitId: 'interno',
      }),
    ).toBe(false)
    expect(
      debePasarMovimientoACuit({
        categoriaId: 'manual',
        categoriaPorTextoOCodigo: 'cobros',
        categoriaCuitId: 'interno',
      }),
    ).toBe(false)
  })
})

describe('motivoCategoriaMantenida', () => {
  it('explica movimientos y reglas, o null si quedó vacía', () => {
    expect(motivoCategoriaMantenida({ movimientos: 0, reglas: 0 })).toBeNull()
    expect(motivoCategoriaMantenida({ movimientos: 2, reglas: 1 })).toBe(
      'Se mantiene porque todavía tiene 2 movimientos y 1 regla',
    )
    expect(motivoCategoriaMantenida({ movimientos: 1, reglas: 0 })).toBe(
      'Se mantiene porque todavía tiene 1 movimiento',
    )
  })
})
