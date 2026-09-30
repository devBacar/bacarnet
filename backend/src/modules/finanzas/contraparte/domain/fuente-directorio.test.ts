import { describe, expect, it } from 'vitest'
import { contraparteDesdeDirectorio } from './fuente-directorio.js'

describe('contraparte desde el directorio', () => {
  const directorio = new Map([['30700000001', { nombre: 'Cliente del Norte', origen: 'banco' as const }]])

  it('si el movimiento solo tiene CUIT, el nombre sale del directorio', () => {
    expect(contraparteDesdeDirectorio('30-70000000-1', directorio)).toEqual({
      nombre: 'Cliente del Norte',
      cuit: '30700000001',
      origen: 'directorio',
    })
  })

  it('sin CUIT o con un CUIT desconocido no resuelve', () => {
    expect(contraparteDesdeDirectorio(null, directorio)).toBeNull()
    expect(contraparteDesdeDirectorio('20111111112', directorio)).toBeNull()
  })
})
