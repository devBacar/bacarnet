import { describe, expect, it } from 'vitest'
import {
  buildHistorialEstadoEntry,
  ChequeTransitionError,
  resolveEstadoAfterActionEmitido,
  resolveEstadoAfterActionLegacy,
  resolveEstadoAfterActionRecibido,
} from './cheque.transitions.js'

describe('resolveEstadoAfterActionRecibido', () => {
  it('depositar desde en_cartera', () => {
    expect(resolveEstadoAfterActionRecibido('depositar', 'en_cartera')).toBe('depositado')
  })

  it('endosar y vender desde en_cartera', () => {
    expect(resolveEstadoAfterActionRecibido('endosar', 'en_cartera')).toBe('endosado')
    expect(resolveEstadoAfterActionRecibido('vender', 'en_cartera')).toBe('vendido')
  })

  it('rechazar desde depositado, endosado o vendido', () => {
    expect(resolveEstadoAfterActionRecibido('rechazar', 'depositado')).toBe('rechazado')
    expect(resolveEstadoAfterActionRecibido('rechazar', 'endosado')).toBe('rechazado')
    expect(resolveEstadoAfterActionRecibido('rechazar', 'vendido')).toBe('rechazado')
  })

  it('bloquea transiciones inválidas', () => {
    expect(() => resolveEstadoAfterActionRecibido('depositar', 'endosado')).toThrow(ChequeTransitionError)
    expect(() => resolveEstadoAfterActionRecibido('rechazar', 'en_cartera')).toThrow(ChequeTransitionError)
  })
})

describe('resolveEstadoAfterActionEmitido', () => {
  it('entregar, debitar y rechazar', () => {
    expect(resolveEstadoAfterActionEmitido('entregar', 'emitido')).toBe('entregado')
    expect(resolveEstadoAfterActionEmitido('debitar', 'entregado')).toBe('debitado')
    expect(resolveEstadoAfterActionEmitido('rechazar', 'entregado')).toBe('rechazado')
  })

  it('anular solo desde emitido', () => {
    expect(resolveEstadoAfterActionEmitido('anular', 'emitido')).toBe('anulado')
    expect(() => resolveEstadoAfterActionEmitido('anular', 'entregado')).toThrow(ChequeTransitionError)
  })
})

describe('resolveEstadoAfterActionLegacy', () => {
  it('alias recibido', () => {
    expect(resolveEstadoAfterActionLegacy('depositar', 'en_cartera')).toBe('depositado')
  })
})

describe('buildHistorialEstadoEntry', () => {
  it('exige usuario y registra cambio de estado', () => {
    const row = buildHistorialEstadoEntry({
      estadoAnterior: 'en_cartera',
      estadoNuevo: 'depositado',
      usuario: 'uid-1',
      nota: 'Depósito en Patagonia',
    })
    expect(row.estadoAnterior).toBe('en_cartera')
    expect(row.estadoNuevo).toBe('depositado')
    expect(row.usuario).toBe('uid-1')
    expect(row.nota).toBe('Depósito en Patagonia')
  })

  it('cada transición debe poder materializarse como historial distinto del estado anterior', () => {
    const prev = 'endosado'
    const next = resolveEstadoAfterActionRecibido('rechazar', prev)
    const entry = buildHistorialEstadoEntry({
      estadoAnterior: prev,
      estadoNuevo: next,
      usuario: 'uid-2',
      nota: null,
    })
    expect(entry.estadoAnterior).not.toBe(entry.estadoNuevo)
    expect(entry.estadoNuevo).toBe('rechazado')
  })
})
