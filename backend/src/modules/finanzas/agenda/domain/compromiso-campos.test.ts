import { describe, expect, it } from 'vitest'
import {
  leerAltaPlanilla,
  leerCuota,
  leerEdicionCompromiso,
  leerGrupo,
  normalizarGrupo,
  normalizarMoneda,
  parseFechaDia,
  textoCuota,
} from './compromiso-campos.js'
import { dateKeyInArgentina } from './vencimiento.alert.js'

describe('campos de la planilla', () => {
  it('el alta sin campos nuevos usa los defaults', () => {
    expect(leerAltaPlanilla({})).toEqual({
      grupo: 'Otros egresos',
      moneda: 'ARS',
      deudaTotalCentavos: null,
      cuotaNumero: null,
      cuotaTotal: null,
      observacion: null,
    })
  })

  it('acepta grupo, dólares, deuda, cuota y observación', () => {
    expect(
      leerAltaPlanilla({
        grupo: 'Inversores USD',
        moneda: 'USD',
        deudaTotalCentavos: 500_000,
        cuotaNumero: 13,
        cuotaTotal: 20,
        observacion: '  Mutuo  ',
      }),
    ).toMatchObject({
      grupo: 'Inversores USD',
      moneda: 'USD',
      deudaTotalCentavos: 500_000,
      cuotaNumero: 13,
      cuotaTotal: 20,
      observacion: 'Mutuo',
    })
    expect(textoCuota(13, 20)).toBe('13 de 20')
  })

  it('rechaza un grupo que no está en la lista y una cuota cruzada', () => {
    expect(() => leerGrupo('Proveedores', 'error')).toThrow(/grupo/)
    expect(() => leerCuota(21, 20)).toThrow(/no puede pasar/)
    expect(() => leerCuota(2, null)).toThrow(/número y un total/)
  })

  it('un doc viejo sin campos cae en los defaults', () => {
    expect(normalizarGrupo(undefined)).toBe('Otros egresos')
    expect(normalizarMoneda(undefined)).toBe('ARS')
    expect(normalizarGrupo('Bancos')).toBe('Bancos')
  })

  it('un día calendario queda en Argentina y no el día anterior', () => {
    const fecha = parseFechaDia('2026-09-30')
    expect(fecha).toBeTruthy()
    expect(dateKeyInArgentina(fecha!)).toBe('2026-09-30')
  })

  it('la edición solo toca los campos que vienen y valida la moneda', () => {
    expect(leerEdicionCompromiso({ observacion: 'Pagaré' })).toEqual({ observacion: 'Pagaré' })
    expect(() => leerEdicionCompromiso({ moneda: 'EUR' })).toThrow(/pesos o dólares/)
    expect(() => leerEdicionCompromiso({})).toThrow(/No hay cambios/)
  })
})
