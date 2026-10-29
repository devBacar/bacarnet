import { describe, expect, it } from 'vitest'
import { armarSaldosCliente } from './saldos-cliente.js'
import type { VientriPendienteDoc } from './tipos.js'

function pendiente(p: Partial<VientriPendienteDoc> & { clave: string }): VientriPendienteDoc {
  return {
    vientriId: 1,
    lado: 'cobrar',
    tipoId: null,
    tipo: null,
    comprobante: '',
    persona: { vientriId: 618, nombre: 'Caminos de las Sierras', cuit: null },
    fecha: null,
    fechaVencimiento: null,
    totalCentavos: 0,
    pendienteCentavos: 0,
    divisaId: null,
    moneda: null,
    cotizacion: null,
    fechaProntoPago: null,
    descuentoProntoPago: null,
    cuotas: null,
    prestamo: false,
    revisar: [],
    fecsys: null,
    ...p,
  }
}

describe('armarSaldosCliente', () => {
  it('suma deuda y saldo a favor por separado y calcula el neto', () => {
    const filas = [
      pendiente({ clave: 'cmp-1', comprobante: 'FA 1', pendienteCentavos: 1_633_807_150, totalCentavos: 28_940_542_969 }),
      pendiente({ clave: 'cmp-2', comprobante: 'NC 2', pendienteCentavos: -500_000_00, totalCentavos: -500_000_00 }),
    ]
    const [saldo] = armarSaldosCliente(filas)
    expect(saldo.personaId).toBe(618)
    expect(saldo.deudaCentavos).toBe(1_633_807_150)
    expect(saldo.favorCentavos).toBe(500_000_00)
    expect(saldo.saldoCentavos).toBe(1_633_807_150 - 500_000_00)
    expect(saldo.comprobantes).toHaveLength(2)
  })

  it('ignora el lado "pagar" y ordena de mayor a menor saldo', () => {
    const filas = [
      pendiente({ clave: 'a', persona: { vientriId: 1, nombre: 'A', cuit: null }, pendienteCentavos: 100_00 }),
      pendiente({ clave: 'b', persona: { vientriId: 2, nombre: 'B', cuit: null }, pendienteCentavos: 900_00 }),
      pendiente({ clave: 'c', lado: 'pagar', persona: { vientriId: 3, nombre: 'C', cuit: null }, pendienteCentavos: 50_00 }),
    ]
    const salida = armarSaldosCliente(filas)
    expect(salida.map((s) => s.personaId)).toEqual([2, 1])
  })

  it('un cliente solo con saldo a favor queda con saldo negativo', () => {
    const filas = [pendiente({ clave: 'nc', pendienteCentavos: -300_00 })]
    const [saldo] = armarSaldosCliente(filas)
    expect(saldo.favorCentavos).toBe(300_00)
    expect(saldo.deudaCentavos).toBe(0)
    expect(saldo.saldoCentavos).toBe(-300_00)
  })
})
