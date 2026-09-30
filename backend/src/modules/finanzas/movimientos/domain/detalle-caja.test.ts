import { describe, expect, it } from 'vitest'
import {
  TABLA_DETALLE_CAJA,
  mezclarDetallesCaja,
  normalizarDetalleCaja,
  palabrasDetalleCajaPorDefecto,
  resolverDetalleCaja,
  sugerirDetalleCaja,
  textoBancoCorto,
} from './detalle-caja.js'

function sugerido(parcial: Partial<Parameters<typeof sugerirDetalleCaja>[0]> = {}) {
  return sugerirDetalleCaja({
    categoriaNombre: null,
    contraparteNombre: null,
    descripcion: 'COMISION',
    bancoNombre: 'Córdoba',
    ...parcial,
  })
}

describe('sugerencia de detalle de caja', () => {
  it('la tabla es el único lugar: cada categoría conocida tiene su palabra', () => {
    const esperadas: Record<string, string> = {
      'Cobros de clientes': 'cliente',
      'Impuesto al cheque': 'imp. cheque',
      'Ingresos Brutos': 'iibb',
      IVA: 'iva',
      'Pago de impuestos (VEP)': 'arca',
      Sueldos: 'sueldos',
      'Comisiones bancarias': 'gastos banco',
      'Mantenimiento de cuenta': 'gastos banco',
      Chequeras: 'gastos banco',
      'Cheques pagados': 'cheques',
      'Cheques depositados': 'dep cheque',
      'Descuento de documentos': 'desc doc',
      'Fondos comunes (FCI)': 'fondo',
      Préstamos: 'préstamo',
      Leasing: 'leasing',
    }
    for (const [categoria, detalle] of Object.entries(esperadas)) {
      expect(sugerido({ categoriaNombre: categoria })).toBe(detalle)
    }
    expect(palabrasDetalleCajaPorDefecto()).toEqual(
      expect.arrayContaining(TABLA_DETALLE_CAJA.map((fila) => fila.detalle)),
    )
    expect(palabrasDetalleCajaPorDefecto()).toEqual(expect.arrayContaining(['julio', 'bancor', 'patagonia']))
  })

  it('en un movimiento interno nombra al otro banco, o dice entre cuentas', () => {
    expect(
      sugerido({
        categoriaNombre: 'Movimiento interno',
        bancoNombre: 'Córdoba',
        contraparteNombre: 'Banco Julio',
        descripcion: 'TRF',
      }),
    ).toBe('julio')
    expect(
      sugerido({
        categoriaNombre: 'Movimiento interno',
        bancoNombre: 'Julio',
        descripcion: 'TRF A BANCOR',
      }),
    ).toBe('bancor')
    expect(
      sugerido({
        categoriaNombre: 'Movimiento interno',
        bancoNombre: 'Patagonia',
        descripcion: 'TRANSFERENCIA A CORDOBA',
      }),
    ).toBe('bancor')
    expect(
      sugerido({
        categoriaNombre: 'Movimiento interno',
        bancoNombre: 'Julio',
        descripcion: 'TRF JULIO',
      }),
    ).toBe('entre cuentas')
    expect(sugerido({ categoriaNombre: 'Movimiento interno', bancoNombre: 'Córdoba' })).toBe('entre cuentas')
  })

  it('sin categoría usa el texto del banco, corto', () => {
    expect(textoBancoCorto('TRANSFERENCIA INMEDIATA JUAN PEREZ')).toBe('juan perez')
    expect(sugerido({ descripcion: 'TRANSFERENCIA INMEDIATA JUAN PEREZ' })).toBe('juan perez')
    expect(sugerido({ categoriaNombre: 'Proveedores' })).toBe('proveedores')
  })

  it('un detalle manual gana; uno guardado como sugerido se vuelve a calcular', () => {
    const base = {
      categoriaNombre: 'IVA',
      contraparteNombre: null,
      descripcion: 'IVA',
      bancoNombre: 'Córdoba',
    }
    expect(
      resolverDetalleCaja({ ...base, detalleCaja: 'arca', detalleCajaOrigen: 'manual' }),
    ).toEqual({ detalle: 'arca', origen: 'manual' })
    expect(
      resolverDetalleCaja({ ...base, detalleCaja: 'arca', detalleCajaOrigen: 'sugerido' }),
    ).toEqual({ detalle: 'iva', origen: 'sugerido' })
    expect(resolverDetalleCaja({ ...base, detalleCaja: null, detalleCajaOrigen: null })).toEqual({
      detalle: 'iva',
      origen: 'sugerido',
    })
  })

  it('normaliza a minúsculas y rechaza basura', () => {
    expect(normalizarDetalleCaja('  Viáticos  ')).toBe('viáticos')
    expect(normalizarDetalleCaja('   ')).toBeNull()
    expect(normalizarDetalleCaja(null)).toBeNull()
    expect(() => normalizarDetalleCaja('x'.repeat(41))).toThrow(/40/)
    expect(() => normalizarDetalleCaja('...')).toThrow(/letra/)
  })
})

describe('lista de detalles', () => {
  it('pone primero las del encargado, por uso, y después las de la tabla', () => {
    const lista = mezclarDetallesCaja({
      tabla: ['cliente', 'arca', 'iva'],
      guardados: [
        { texto: 'Viáticos', veces: 4 },
        { texto: 'cliente', veces: 9 },
        { texto: 'patente', veces: 2 },
      ],
    })
    expect(lista.map((item) => item.texto)).toEqual(['viáticos', 'patente', 'cliente', 'arca', 'iva'])
    expect(lista.filter((item) => item.propio).map((item) => item.texto)).toEqual(['viáticos', 'patente'])
    expect(lista.find((item) => item.texto === 'cliente')?.veces).toBe(9)
    expect(lista.find((item) => item.texto === 'arca')?.veces).toBe(0)
  })
})
