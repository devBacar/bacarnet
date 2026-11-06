import { describe, expect, it } from 'vitest'
import { aplicarFusion, aplicarRenombre } from './proveedores-financieros-cambios.js'

const gonzalez = { nombre: 'GONZALEZ FABIAN', nombreNormalizado: 'gonzalez fabian', alias: ['FABIAN G'] }
const gonzales = { nombre: 'GONZALES FABIAN', nombreNormalizado: 'gonzales fabian', alias: ['G. FABIAN'] }

describe('aplicarRenombre', () => {
  it('el nombre nuevo se muestra y el viejo queda como alias', () => {
    const r = aplicarRenombre(gonzalez, 'Fabián González')
    expect(r).toEqual({
      nombre: 'Fabián González',
      nombreNormalizado: 'fabian gonzalez',
      alias: ['FABIAN G', 'GONZALEZ FABIAN'],
    })
  })

  it('solo cambiar mayúsculas o acentos no agrega un alias repetido', () => {
    const r = aplicarRenombre(gonzalez, 'Gonzalez Fabian')
    expect(r.alias).toEqual(['FABIAN G'])
    expect(r.nombreNormalizado).toBe('gonzalez fabian')
  })

  it('si el nombre nuevo era un alias, deja de estar en la lista', () => {
    const r = aplicarRenombre(gonzalez, 'Fabian G')
    expect(r.alias).toEqual(['GONZALEZ FABIAN'])
  })
})

describe('aplicarFusion', () => {
  it('el que queda se lleva nombre y alias del otro, sin cambiar su nombre', () => {
    expect(aplicarFusion(gonzalez, gonzales)).toEqual({
      nombre: 'GONZALEZ FABIAN',
      nombreNormalizado: 'gonzalez fabian',
      alias: ['FABIAN G', 'GONZALES FABIAN', 'G. FABIAN'],
    })
  })

  it('no repite nombres que ya estaban (comparando sin acentos ni mayúsculas)', () => {
    const otro = { nombre: 'Fabián G', nombreNormalizado: 'fabian g', alias: ['gonzalez fabian'] }
    expect(aplicarFusion(gonzalez, otro).alias).toEqual(['FABIAN G'])
  })
})
