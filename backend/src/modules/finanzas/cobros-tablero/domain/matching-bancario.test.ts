import { describe, expect, it } from 'vitest'
import { candidatosDeCobro } from './matching-bancario.js'
import type { VientriPendienteDoc } from '../../vientri/domain/tipos.js'

function pendiente(overrides: Partial<VientriPendienteDoc> & { pendienteCentavos: number }): VientriPendienteDoc {
  return {
    clave: 'cmp-1',
    vientriId: 1,
    lado: 'cobrar',
    tipoId: null,
    tipo: 'Factura A',
    comprobante: 'FAA 0001-00000001',
    persona: { vientriId: 10, nombre: 'Cliente Uno', cuit: '20304050607' },
    fecha: '2026-11-01',
    fechaVencimiento: '2026-11-10',
    totalCentavos: overrides.pendienteCentavos,
    divisaId: 1,
    moneda: 'ARS',
    cotizacion: null,
    fechaProntoPago: null,
    descuentoProntoPago: null,
    cuotas: null,
    prestamo: false,
    obs: null,
    revisar: [],
    fecsys: null,
    ...overrides,
  }
}

describe('candidatosDeCobro', () => {
  it('matchea por CUIT exacto + monto exacto', () => {
    const mov = { id: 'm1', montoCentavos: 100_00, contraparteCuit: '20304050607', customerCuit: null }
    const candidatos = candidatosDeCobro(mov, [pendiente({ pendienteCentavos: 100_00 })])
    expect(candidatos).toHaveLength(1)
  })

  it('usa customerCuit si no hay contraparteCuit', () => {
    const mov = { id: 'm1', montoCentavos: 100_00, contraparteCuit: null, customerCuit: '20304050607' }
    const candidatos = candidatosDeCobro(mov, [pendiente({ pendienteCentavos: 100_00 })])
    expect(candidatos).toHaveLength(1)
  })

  it('sin CUIT en el movimiento, no matchea nunca (no inventa por nombre)', () => {
    const mov = { id: 'm1', montoCentavos: 100_00, contraparteCuit: null, customerCuit: null }
    const candidatos = candidatosDeCobro(mov, [pendiente({ pendienteCentavos: 100_00 })])
    expect(candidatos).toHaveLength(0)
  })

  it('CUIT distinto: no matchea aunque el monto sea igual', () => {
    const mov = { id: 'm1', montoCentavos: 100_00, contraparteCuit: '30111222334', customerCuit: null }
    const candidatos = candidatosDeCobro(mov, [pendiente({ pendienteCentavos: 100_00 })])
    expect(candidatos).toHaveLength(0)
  })

  it('monto distinto (pago parcial): no matchea, no reparte', () => {
    const mov = { id: 'm1', montoCentavos: 50_00, contraparteCuit: '20304050607', customerCuit: null }
    const candidatos = candidatosDeCobro(mov, [pendiente({ pendienteCentavos: 100_00 })])
    expect(candidatos).toHaveLength(0)
  })

  it('un saldo a favor (pendienteCentavos negativo) nunca es candidato', () => {
    const mov = { id: 'm1', montoCentavos: 100_00, contraparteCuit: '20304050607', customerCuit: null }
    const candidatos = candidatosDeCobro(mov, [pendiente({ pendienteCentavos: -100_00 })])
    expect(candidatos).toHaveLength(0)
  })

  it('dos facturas del mismo cliente con el mismo monto: ambiguo, devuelve las dos (el que llama no matchea)', () => {
    const mov = { id: 'm1', montoCentavos: 100_00, contraparteCuit: '20304050607', customerCuit: null }
    const candidatos = candidatosDeCobro(mov, [
      pendiente({ clave: 'cmp-1', vientriId: 1, pendienteCentavos: 100_00 }),
      pendiente({ clave: 'cmp-2', vientriId: 2, pendienteCentavos: 100_00 }),
    ])
    expect(candidatos).toHaveLength(2)
  })

  it('CUIT con guiones/puntos se normaliza antes de comparar', () => {
    const mov = { id: 'm1', montoCentavos: 100_00, contraparteCuit: '20-30405060-7', customerCuit: null }
    const candidatos = candidatosDeCobro(mov, [pendiente({ pendienteCentavos: 100_00 })])
    expect(candidatos).toHaveLength(1)
  })
})
