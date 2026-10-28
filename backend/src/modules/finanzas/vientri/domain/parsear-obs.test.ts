import { describe, expect, it } from 'vitest'
import { parsearObs } from './parsear-obs.js'

describe('parsearObs', () => {
  describe('renovación', () => {
    it('extrae un solo número de cheque', () => {
      const r = parsearObs('Renovacion cheque n° 38842801')
      expect(r.renovacion).toEqual({ chequeIds: ['38842801'] })
      expect(r.operacionUsd).toBeNull()
    })

    it('extrae varios números separados por coma', () => {
      const r = parsearObs('Renovacion cheques n° 38842801, 38842800, 38842799')
      expect(r.renovacion?.chequeIds).toEqual(['38842801', '38842800', '38842799'])
    })

    it('extrae números separados por coma y "y"', () => {
      const r = parsearObs('Renovacion cheques n° 38842801, 38842800 y 38842799')
      expect(r.renovacion?.chequeIds).toEqual(['38842801', '38842800', '38842799'])
    })

    it('maneja "Renovación" con acento', () => {
      const r = parsearObs('Renovación cheques n° 12345 y 67890')
      expect(r.renovacion?.chequeIds).toEqual(['12345', '67890'])
    })

    it('maneja nº con ordinal', () => {
      const r = parsearObs('Renovacion cheques nº 11111, 22222')
      expect(r.renovacion?.chequeIds).toEqual(['11111', '22222'])
    })

    it('"Renovacion" sola marca renovación sin IDs', () => {
      const r = parsearObs('Renovacion')
      expect(r.renovacion).toEqual({ chequeIds: [] })
    })

    it('"Renovacion cheque 39584927" sin n°', () => {
      const r = parsearObs('Renovacion cheque 39584927')
      expect(r.renovacion?.chequeIds).toEqual(['39584927'])
    })

    it('números con barras expandidos', () => {
      const r = parsearObs('Renovacion cheques 39316462/63/39316308/9/10/11/12/13/14')
      expect(r.renovacion?.chequeIds).toEqual([
        '39316462', '39316463',
        '39316308', '39316309', '39316310', '39316311',
        '39316312', '39316313', '39316314',
      ])
    })
  })

  describe('operación USD', () => {
    it('parsea u$70.000 TC1565', () => {
      const r = parsearObs('u$70.000 TC1565')
      expect(r.operacionUsd).toEqual({ montoUsd: 70000, cotizacion: 1565 })
      expect(r.renovacion).toBeNull()
    })

    it('parsea U$70.000 TC $1555', () => {
      const r = parsearObs('U$70.000 TC $1555')
      expect(r.operacionUsd).toEqual({ montoUsd: 70000, cotizacion: 1555 })
    })

    it('parsea usd 70.000 TC1540', () => {
      const r = parsearObs('usd 70.000 TC1540')
      expect(r.operacionUsd).toEqual({ montoUsd: 70000, cotizacion: 1540 })
    })

    it('parsea U$ 65000 TC1470', () => {
      const r = parsearObs('U$ 65000 TC1470')
      expect(r.operacionUsd).toEqual({ montoUsd: 65000, cotizacion: 1470 })
    })

    it('parsea u$20.000 TC $1.560', () => {
      const r = parsearObs('u$20.000 TC $1.560')
      expect(r.operacionUsd).toEqual({ montoUsd: 20000, cotizacion: 1560 })
    })
  })

  describe('sin patrón', () => {
    it('OBS vacío', () => {
      const r = parsearObs('')
      expect(r.renovacion).toBeNull()
      expect(r.operacionUsd).toBeNull()
      expect(r.obsOriginal).toBe('')
    })

    it('OBS con texto libre sin patrón', () => {
      const r = parsearObs('Op')
      expect(r.renovacion).toBeNull()
      expect(r.operacionUsd).toBeNull()
      expect(r.obsOriginal).toBe('Op')
    })

    it('OBS null', () => {
      const r = parsearObs(null)
      expect(r.renovacion).toBeNull()
      expect(r.operacionUsd).toBeNull()
    })

    it('"INTERESES Y CAP" no matchea renovación', () => {
      const r = parsearObs('INTERESES Y CAP')
      expect(r.renovacion).toBeNull()
    })
  })
})
