import { describe, expect, it } from 'vitest'
import { normalizarGrupoCategoria } from './categoria-movimiento.js'

describe('normalizarGrupoCategoria', () => {
  it('recorta, colapsa espacios y trata el vacío como null', () => {
    expect(normalizarGrupoCategoria('  Gastos   bancarios ')).toBe('Gastos bancarios')
    expect(normalizarGrupoCategoria('   ')).toBeNull()
    expect(normalizarGrupoCategoria(null)).toBeNull()
    expect(normalizarGrupoCategoria(undefined)).toBeNull()
  })

  it('rechaza texto que no es string y más de 40 caracteres', () => {
    expect(() => normalizarGrupoCategoria(12)).toThrow(/texto/)
    expect(() => normalizarGrupoCategoria('a'.repeat(41))).toThrow(/40/)
  })
})
