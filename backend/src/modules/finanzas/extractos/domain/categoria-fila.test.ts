import { describe, expect, it } from 'vitest'
import { aplicarCategorias, SIN_CLASIFICAR } from './categoria-fila.js'

const fila = {
  descripcion: 'IMPUESTO AL DEBITO',
  codeDescriptionIb: 'IMP',
  customerCuit: '20-11111111-1',
}

describe('categoría por fila', () => {
  const reglas = [
    { tipo: 'descripcion' as const, descripcionKey: 'IMPUESTO AL DEBITO', categoriaId: 'cat-regla' },
  ]
  const nombres = new Map([
    ['cat-bacarnet', 'Pagos'],
    ['cat-regla', 'Impuestos'],
  ])

  it('usa la categoría del movimiento emparejado', () => {
    expect(aplicarCategorias([fila], ['cat-bacarnet'], reglas, nombres)).toEqual(['Pagos'])
  })

  it('si no hay pareja, usa la regla', () => {
    expect(aplicarCategorias([fila], [null], reglas, nombres)).toEqual(['Impuestos'])
  })

  it('si no hay pareja ni regla, queda sin clasificar', () => {
    expect(aplicarCategorias([{ descripcion: 'OTRA COSA' }], [null], reglas, nombres)).toEqual([SIN_CLASIFICAR])
  })

  it('si la categoría emparejada ya no existe, queda sin clasificar', () => {
    expect(aplicarCategorias([fila], ['cat-borrada'], reglas, nombres)).toEqual([SIN_CLASIFICAR])
  })
})
