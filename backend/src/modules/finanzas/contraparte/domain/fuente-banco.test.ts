import { describe, expect, it } from 'vitest'
import { contraparteDesdeBanco } from './fuente-banco.js'

describe('contraparte desde el banco', () => {
  it('toma el nombre y el CUIT que mandó el banco', () => {
    expect(
      contraparteDesdeBanco({
        depositorDescription: '  Molinos Río  de la Plata  ',
        customerCuit: '30-50001234-8',
      }),
    ).toEqual({
      nombre: 'Molinos Río de la Plata',
      cuit: '30500012348',
      origen: 'banco',
    })
  })

  it('no resuelve si el banco no mandó nombre, aunque haya CUIT', () => {
    expect(contraparteDesdeBanco({ depositorDescription: '   ', customerCuit: '30500012348' })).toBeNull()
    expect(contraparteDesdeBanco({ depositorDescription: null, customerCuit: null })).toBeNull()
  })

  it('guarda el nombre igual si el CUIT no tiene 11 dígitos', () => {
    expect(contraparteDesdeBanco({ depositorDescription: 'ACME', customerCuit: '20-1' })).toEqual({
      nombre: 'ACME',
      cuit: null,
      origen: 'banco',
    })
  })
})
