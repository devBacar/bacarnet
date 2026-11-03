import { describe, expect, it } from 'vitest'
import { facturasPorOp } from './facturas-por-op.js'
import type { FilaCsv } from './csv.js'
import type { VientriPersonaDoc } from './tipos.js'

const persona = (id: number, nombre: string): VientriPersonaDoc => ({
  vientriId: id, nombre, nombreFantasia: null, cuit: null, esCliente: false, esProveedor: false,
  inactivo: false, incobrable: false, limiteCreditoCentavos: null, plazoPagoClienteDias: null,
  ultimoPagoCliente: null, plazoPagoProveedorDias: null, cbu: null, baja: false,
})

const personas = new Map([
  [1, persona(1, 'EMPRESA PROPIA')],
  [60, persona(60, 'SAN URBANO SA')],
  [70, persona(70, 'PROVEEDOR X')],
])

function fila(p: Record<string, string>): FilaCsv {
  return p as FilaCsv
}

describe('facturasPorOp', () => {
  it('arma el mapa OP → facturas canceladas', () => {
    const aplicaciones: FilaCsv[] = [
      fila({ id_cmp: '100', id_cmp_cancelado: '200', importe: '62026.00', baja: '0' }),
      fila({ id_cmp: '100', id_cmp_cancelado: '201', importe: '15000.00', baja: '0' }),
    ]
    const comprobantes: FilaCsv[] = [
      fila({ vientri_id: '200', nom_tipo: 'FCG', letra: 'A', punto_venta: '1', numero: '456', id_persona: '60', total: '62026.00', obs: 'Combustible' }),
      fila({ vientri_id: '201', nom_tipo: 'FCG', letra: 'A', punto_venta: '1', numero: '789', id_persona: '70', total: '15000.00', obs: '' }),
    ]

    const mapa = facturasPorOp(aplicaciones, comprobantes, personas)

    expect(mapa.size).toBe(1)
    const facturas = mapa.get(100)!
    expect(facturas).toHaveLength(2)
    expect(facturas[0]).toEqual({
      comprobante: 'FCG A 0001-00000456',
      persona: 'SAN URBANO SA',
      totalCentavos: 6202600,
      obs: 'Combustible',
    })
    expect(facturas[1]).toEqual({
      comprobante: 'FCG A 0001-00000789',
      persona: 'PROVEEDOR X',
      totalCentavos: 1500000,
      obs: null,
    })
  })

  it('devuelve mapa vacío si la OP no tiene aplicaciones', () => {
    const mapa = facturasPorOp([], [], personas)
    expect(mapa.size).toBe(0)
  })

  it('ignora aplicaciones dadas de baja', () => {
    const aplicaciones: FilaCsv[] = [
      fila({ id_cmp: '100', id_cmp_cancelado: '200', importe: '1000.00', baja: '1' }),
    ]
    const comprobantes: FilaCsv[] = [
      fila({ vientri_id: '200', nom_tipo: 'FCG', letra: 'A', punto_venta: '1', numero: '456', id_persona: '60', total: '1000.00', obs: '' }),
    ]

    const mapa = facturasPorOp(aplicaciones, comprobantes, personas)
    expect(mapa.size).toBe(0)
  })

  it('ignora aplicaciones cuyo comprobante cancelado no existe', () => {
    const aplicaciones: FilaCsv[] = [
      fila({ id_cmp: '100', id_cmp_cancelado: '999', importe: '1000.00', baja: '0' }),
    ]

    const mapa = facturasPorOp(aplicaciones, [], personas)
    expect(mapa.size).toBe(0)
  })

  it('agrupa facturas de distintas OPs correctamente', () => {
    const aplicaciones: FilaCsv[] = [
      fila({ id_cmp: '100', id_cmp_cancelado: '200', importe: '5000.00', baja: '0' }),
      fila({ id_cmp: '101', id_cmp_cancelado: '201', importe: '3000.00', baja: '0' }),
    ]
    const comprobantes: FilaCsv[] = [
      fila({ vientri_id: '200', nom_tipo: 'FCG', letra: 'A', punto_venta: '1', numero: '10', id_persona: '60', total: '5000.00', obs: 'Gasoil' }),
      fila({ vientri_id: '201', nom_tipo: 'IMP', letra: '', punto_venta: '0', numero: '20', id_persona: '70', total: '3000.00', obs: 'IIBB' }),
    ]

    const mapa = facturasPorOp(aplicaciones, comprobantes, personas)
    expect(mapa.size).toBe(2)
    expect(mapa.get(100)!).toHaveLength(1)
    expect(mapa.get(101)!).toHaveLength(1)
    expect(mapa.get(100)![0].obs).toBe('Gasoil')
    expect(mapa.get(101)![0].obs).toBe('IIBB')
  })
})
