import { describe, expect, it } from 'vitest'
import {
  aplicarReglasAFilas,
  categoriaPorReglas,
  claveDescripcionRegla,
  validarCodigoIbRegla,
  validarCuitRegla,
  validarDescripcionRegla,
} from './regla-categorizacion.js'

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

  it('prioriza CUIT sobre descripción y código, y no pisa una categoría puesta', () => {
    const reglas = [
      { tipo: 'cuit' as const, cuitKey: '30668134978', categoriaId: 'interno' },
      { tipo: 'descripcion' as const, descripcionKey: 'TRF.DATA', categoriaId: 'cobros' },
      { tipo: 'codigoIb' as const, codigoIbKey: 'TRF.DATA', categoriaId: 'codigo' },
    ]
    const fila = {
      descripcion: 'TRF.DATA',
      codeDescriptionIb: 'TRF.DATA',
      customerCuit: '30-66813497-8',
    }
    const { filas, categorizadas } = aplicarReglasAFilas([fila, { ...fila, categoriaId: 'manual' }], reglas)
    expect(filas.map((item) => item.categoriaId)).toEqual(['interno', 'manual'])
    expect(categorizadas).toBe(1)
    expect(categoriaPorReglas({ ...fila, categoriaId: 'manual' }, reglas)).toBe('interno')
  })

  it('si no hay CUIT usa la descripción, y si no hay texto usa el código', () => {
    const reglas = [
      { tipo: 'descripcion' as const, descripcionKey: 'IVA *INTERESES*', categoriaId: 'iva' },
      { tipo: 'codigoIb' as const, codigoIbKey: 'COM. TRANSF', categoriaId: 'comisiones' },
    ]
    const { filas } = aplicarReglasAFilas(
      [
        { descripcion: 'IVA  *INTERESES*', codeDescriptionIb: 'COM. TRANSF', customerCuit: '' },
        { descripcion: 'OTRA COSA', codeDescriptionIb: 'COM.  TRANSF' },
        { descripcion: 'NADA', codeDescriptionIb: 'OTRO' },
      ],
      reglas,
    )
    expect(filas.map((item) => item.categoriaId)).toEqual(['iva', 'comisiones', null])
  })
})

describe('claves de código y CUIT', () => {
  it('colapsa espacios del código y exige 11 dígitos en el CUIT', () => {
    expect(validarCodigoIbRegla('  COM.  TRANSF ')).toBe('COM. TRANSF')
    expect(validarCuitRegla('30-66813497-8')).toBe('30668134978')
    expect(() => validarCuitRegla('3066813497')).toThrow(/11 dígitos/)
    expect(() => validarCuitRegla(30668134978)).toThrow(/texto/)
  })
})
