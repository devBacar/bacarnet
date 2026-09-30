import { describe, expect, it } from 'vitest'
import {
  esEntornoDePruebas,
  exigirEntornoDePruebas,
  MENSAJE_SOLO_PRUEBAS,
  SoloEnPruebasError,
} from './hoy.demo.js'

describe('hoy: guard de datos de ejemplo', () => {
  it('deja pasar con el emulador de Functions', () => {
    expect(esEntornoDePruebas({ FUNCTIONS_EMULATOR: 'true' })).toBe(true)
    expect(() => exigirEntornoDePruebas({ FUNCTIONS_EMULATOR: 'true' })).not.toThrow()
  })

  it('deja pasar cuando apunta al emulador de Firestore', () => {
    expect(esEntornoDePruebas({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })).toBe(true)
    expect(() => exigirEntornoDePruebas({ FIRESTORE_EMULATOR_HOST: 'localhost:8080' })).not.toThrow()
  })

  it('se niega sin emulador', () => {
    expect(esEntornoDePruebas({})).toBe(false)
    expect(esEntornoDePruebas({ FUNCTIONS_EMULATOR: 'false' })).toBe(false)
    expect(esEntornoDePruebas({ FUNCTIONS_EMULATOR: undefined, FIRESTORE_EMULATOR_HOST: '' })).toBe(false)
    expect(esEntornoDePruebas({ FIRESTORE_EMULATOR_HOST: '   ' })).toBe(false)
  })

  it('el error que lanza es un 403 con el mensaje de solo pruebas', () => {
    let capturado: unknown = null
    try {
      exigirEntornoDePruebas({})
    } catch (err) {
      capturado = err
    }
    expect(capturado).toBeInstanceOf(SoloEnPruebasError)
    expect((capturado as SoloEnPruebasError).status).toBe(403)
    expect((capturado as SoloEnPruebasError).message).toBe(MENSAJE_SOLO_PRUEBAS)
  })
})
