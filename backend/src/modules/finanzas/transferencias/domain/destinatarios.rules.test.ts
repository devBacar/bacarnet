import { describe, expect, it } from 'vitest'
import {
  agruparSugerencias,
  filtrarDestinatarios,
  siguienteUsoDestinatario,
  type DestinatarioVista,
} from './destinatarios.rules.js'

const CBU_A = '0340070800700370037009'
const CBU_B = '3050001101010001303450'

function vista(partial: Partial<DestinatarioVista> & Pick<DestinatarioVista, 'id' | 'nombre' | 'cbu'>): DestinatarioVista {
  return {
    cuit: null,
    alias: null,
    bancoNombre: null,
    tipo: 'terceros',
    usos: 0,
    ultimoUsoAt: null,
    sugerido: false,
    ...partial,
  }
}

describe('siguienteUsoDestinatario', () => {
  it('da de alta con un uso cuando no existe', () => {
    expect(siguienteUsoDestinatario(null)).toEqual({ usos: 1, esAlta: true })
  })

  it('suma un uso sin tratarlo como alta', () => {
    expect(siguienteUsoDestinatario({ usos: 4 })).toEqual({ usos: 5, esAlta: false })
    expect(siguienteUsoDestinatario({ usos: 0 })).toEqual({ usos: 1, esAlta: false })
  })
})

describe('filtrarDestinatarios', () => {
  const rows = [
    vista({ id: '1', nombre: 'Acme SA', cbu: CBU_A, cuit: '20123456786', alias: 'acme', usos: 2, tipo: 'proveedores' }),
    vista({ id: '2', nombre: 'Beta SRL', cbu: CBU_B, alias: 'casa', usos: 9, tipo: 'terceros', ultimoUsoAt: '2026-01-01T00:00:00.000Z' }),
    vista({ id: '3', nombre: 'Gamma', cbu: '0110000000000000000000', usos: 9, tipo: 'terceros', ultimoUsoAt: '2026-06-01T00:00:00.000Z' }),
  ]

  it('busca por nombre, alias, CUIT o CBU y ordena por usos', () => {
    expect(filtrarDestinatarios(rows, 'acme').map((row) => row.id)).toEqual(['1'])
    expect(filtrarDestinatarios(rows, '20-12345678-6').map((row) => row.id)).toEqual(['1'])
    expect(filtrarDestinatarios(rows, CBU_B).map((row) => row.id)).toEqual(['2'])
    expect(filtrarDestinatarios(rows, '', 'terceros').map((row) => row.id)).toEqual(['3', '2'])
  })

  it('corta en 50', () => {
    const muchos = Array.from({ length: 60 }, (_, i) =>
      vista({ id: String(i), nombre: `N${i}`, cbu: CBU_A, usos: i }),
    )
    expect(filtrarDestinatarios(muchos, '')).toHaveLength(50)
    expect(filtrarDestinatarios(muchos, '')[0]?.usos).toBe(59)
  })
})

describe('agruparSugerencias', () => {
  it('arma la agenda vacía desde transferencias a terceros y proveedores', () => {
    const sugerencias = agruparSugerencias([
      {
        tipo: 'cuentas_propias',
        cuentaCreditoCbu: CBU_A,
        destinoNombre: 'No entra',
        fechaMs: 300,
      },
      {
        tipo: 'proveedores',
        cuentaCreditoCbu: CBU_A,
        compromisoNombre: 'Viejo nombre',
        fechaMs: 100,
      },
      {
        tipo: 'proveedores',
        cuentaCreditoCbu: ` ${CBU_A} `,
        destinoNombre: 'Proveedor nuevo',
        destinoCuit: '20123456786',
        fechaMs: 200,
      },
      {
        tipo: 'terceros',
        cuentaCreditoCbu: '123',
        destinoNombre: 'CBU corto',
        fechaMs: 400,
      },
    ])

    expect(sugerencias).toHaveLength(1)
    expect(sugerencias[0]).toMatchObject({
      id: `sugerencia:${CBU_A}`,
      nombre: 'Proveedor nuevo',
      cbu: CBU_A,
      cuit: '20123456786',
      tipo: 'proveedores',
      usos: 2,
      bancoNombre: 'Patagonia',
      sugerido: true,
    })
  })
})
