import { describe, expect, it } from 'vitest'
import { aplicarReglasAFilas, claveDescripcionRegla, validarDescripcionRegla } from './regla-categorizacion.js'

describe('claveDescripcionRegla', () => {
  it('recorta espacios pero respeta mayúsculas y minúsculas', () => {
    expect(claveDescripcionRegla('  IVA   Alicuota General ')).toBe('IVA Alicuota General')
    expect(claveDescripcionRegla('IVA ALICUOTA GENERAL')).not.toBe(claveDescripcionRegla('IVA Alicuota General'))
  })
})

describe('validarDescripcionRegla', () => {
  it('rechaza vacío y no texto', () => {
    expect(() => validarDescripcionRegla('   ')).toThrow()
    expect(() => validarDescripcionRegla(12)).toThrow()
  })
})

describe('aplicarReglasAFilas', () => {
  const reglas = [
    { descripcionKey: 'IMPUESTO AL DEBITO', categoriaId: 'impuestos' },
    { descripcionKey: 'COMIS.INTERBANKING', categoriaId: 'comisiones' },
  ]

  it('categoriza por texto exacto y deja el resto en null', () => {
    const { filas, categorizadas } = aplicarReglasAFilas(
      [
        { descripcion: 'IMPUESTO AL DEBITO' },
        { descripcion: 'impuesto al debito' },
        { descripcion: 'OTRA COSA' },
      ],
      reglas,
    )
    expect(filas.map((fila) => fila.categoriaId)).toEqual(['impuestos', null, null])
    expect(categorizadas).toBe(1)
  })

  it('no pisa una categoría que ya venía puesta', () => {
    const { filas, categorizadas } = aplicarReglasAFilas(
      [{ descripcion: 'COMIS.INTERBANKING', categoriaId: 'manual' }],
      reglas,
    )
    expect(filas[0].categoriaId).toBe('manual')
    expect(categorizadas).toBe(0)
  })

  it('sin reglas devuelve las filas con categoriaId explícito', () => {
    const { filas } = aplicarReglasAFilas([{ descripcion: 'X' }], [])
    expect(filas[0].categoriaId).toBeNull()
  })
})
