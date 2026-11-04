import { describe, expect, it } from 'vitest'
import { camposVivosCambiados } from './campos-vivos.js'

const VIVOS = ['pagado', 'estado', 'fechaConciliado', 'baja'] as const

describe('camposVivosCambiados', () => {
  it('devuelve solo los campos vivos que cambiaron', () => {
    const previo = { pagado: false, estado: 'En cartera', fechaConciliado: null, baja: false, beneficiario: 'A' }
    const nuevo = { pagado: true, estado: 'En cartera', fechaConciliado: '2026-10-15', baja: false, beneficiario: 'B' }
    expect(camposVivosCambiados(previo, nuevo, VIVOS)).toEqual({ pagado: true, fechaConciliado: '2026-10-15' })
  })

  it('no toca los campos que no son vivos aunque cambien', () => {
    const previo = { pagado: false, beneficiario: 'A', obsOriginal: 'x' }
    const nuevo = { pagado: false, beneficiario: 'B', obsOriginal: 'y' }
    expect(camposVivosCambiados(previo, nuevo, VIVOS)).toBeNull()
  })

  it('trata un campo ausente igual que null', () => {
    expect(camposVivosCambiados({}, { fechaConciliado: null }, VIVOS)).toBeNull()
  })

  it('detecta una baja', () => {
    expect(camposVivosCambiados({ baja: false }, { baja: true }, VIVOS)).toEqual({ baja: true })
  })
})
