import { describe, expect, it } from 'vitest'
import type { ContraparteGuardada } from './contraparte.types.js'
import { elegirContraparte } from './resolver-prioridad.js'

function fuente(origen: ContraparteGuardada['origen'], nombre = 'Alguien'): ContraparteGuardada {
  return { nombre, cuit: '30700000001', origen }
}

const vacio: ContraparteGuardada = { nombre: null, cuit: null, origen: null }

describe('prioridad de contraparte', () => {
  const orden = [
    fuente('banco', 'Banco'),
    fuente('transferencia', 'Transferencia'),
    fuente('agenda', 'Agenda'),
    fuente('cheque', 'Cheque'),
    fuente('interbanking', 'Interbanking'),
    fuente('directorio', 'Directorio'),
    fuente('categoria', 'Categoria'),
  ]

  it('la primera fuente con nombre gana', () => {
    expect(elegirContraparte({ actual: vacio, candidatos: orden }).origen).toBe('banco')
    expect(elegirContraparte({ actual: vacio, candidatos: [null, null, orden[2] ?? null] }).nombre).toBe('Agenda')
  })

  it('manual no se pisa, aunque el nombre esté vacío', () => {
    expect(
      elegirContraparte({
        actual: { nombre: 'Cargado', cuit: null, origen: 'manual' },
        candidatos: orden,
      }),
    ).toEqual({ nombre: 'Cargado', cuit: null, origen: 'manual' })
    expect(
      elegirContraparte({
        actual: { nombre: null, cuit: null, origen: 'manual' },
        candidatos: orden,
      }).origen,
    ).toBe('manual')
  })

  it('el cheque gana sobre Interbanking y pierde contra la agenda', () => {
    expect(
      elegirContraparte({ actual: vacio, candidatos: [null, null, null, orden[3] ?? null, orden[4] ?? null] }).origen,
    ).toBe('cheque')
    expect(
      elegirContraparte({ actual: vacio, candidatos: [null, null, orden[2] ?? null, orden[3] ?? null] }).origen,
    ).toBe('agenda')
  })

  it('si nadie resuelve, queda vacío', () => {
    expect(elegirContraparte({ actual: vacio, candidatos: [null, { nombre: '  ', cuit: null, origen: 'banco' }] })).toEqual(
      vacio,
    )
  })
})
