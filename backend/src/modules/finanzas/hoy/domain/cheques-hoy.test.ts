import { describe, expect, it } from 'vitest'
import { formatoPesos, mananaHabil } from './hoy.fechas.js'
import type { ArmarHoyInput, ChequeEnHoy, CuentaHoy } from './hoy.tipos.js'
import { armarVistaHoy } from './hoy.vista.js'
import {
  armarChequesADebitar,
  camposEndoso,
  esChequeEnCartera,
  ordenarCartera,
} from './cheques-hoy.js'

const HOY = '2026-09-30'

function cheque(partial: Partial<ChequeEnHoy> & Pick<ChequeEnHoy, 'id'>): ChequeEnHoy {
  return {
    numero: '100',
    direccion: 'recibido',
    estado: 'en_cartera',
    utilizado: null,
    montoCentavos: 10_000,
    fechaPago: HOY,
    bancoEmisor: null,
    destinatario: null,
    emisor: 'Emisor',
    cliente: null,
    ...partial,
  }
}

function cuenta(partial: Partial<CuentaHoy> & Pick<CuentaHoy, 'id' | 'bancoNombre' | 'saldoActualCentavos'>): CuentaHoy {
  return {
    tipo: 'CC',
    moneda: 'ARS',
    descubiertoCentavos: null,
    ...partial,
  }
}

function vista(cheques: ChequeEnHoy[], cuentas: CuentaHoy[] = []) {
  const input: ArmarHoyInput = {
    now: new Date('2026-09-30T15:00:00.000Z'),
    compromisos: [],
    cobros: [],
    movimientos: [],
    cuentas,
    transferencias: [],
    cheques,
  }
  return armarVistaHoy(input)
}

describe('cartera de cheques', () => {
  it('entra un recibido que no se usó, aunque el estado sea en cartera o pendiente', () => {
    expect(esChequeEnCartera(cheque({ id: 'a', estado: 'en_cartera', utilizado: null }))).toBe(true)
    expect(esChequeEnCartera(cheque({ id: 'b', estado: 'en_cartera', utilizado: false }))).toBe(true)
    expect(esChequeEnCartera(cheque({ id: 'c', estado: 'pendiente', utilizado: null }))).toBe(true)
  })

  it('no entra si ya se usó, si está fuera de cartera o si es emitido', () => {
    for (const estado of ['rechazado', 'anulado', 'depositado', 'vendido', 'debitado']) {
      expect(esChequeEnCartera(cheque({ id: estado, estado }))).toBe(false)
    }
    expect(esChequeEnCartera(cheque({ id: 'usado', utilizado: true }))).toBe(false)
    expect(esChequeEnCartera(cheque({ id: 'propio', direccion: 'emitido', estado: 'pendiente' }))).toBe(false)
  })

  it('ordena por cercanía al monto del pago', () => {
    const orden = ordenarCartera(
      [
        { numero: '1', fechaPago: '2026-10-01', montoCentavos: 100 },
        { numero: '2', fechaPago: '2026-10-01', montoCentavos: 250 },
        { numero: '3', fechaPago: '2026-09-01', montoCentavos: 180 },
      ],
      200,
    )
    expect(orden.map((row) => row.numero)).toEqual(['3', '2', '1'])
  })
})

describe('endoso', () => {
  it('solo marca utilizado y el destinatario', () => {
    expect(camposEndoso('  Proveedor SA  ')).toEqual({ utilizado: true, destinatario: 'Proveedor SA' })
    expect(Object.keys(camposEndoso('X')).sort()).toEqual(['destinatario', 'utilizado'])
    expect(camposEndoso('X')).not.toHaveProperty('endosante')
    expect(camposEndoso('X')).not.toHaveProperty('estado')
    expect(camposEndoso('X')).not.toHaveProperty('fechaEntregado')
  })
})

describe('cheques que se debitan mañana', () => {
  it('mañana hábil saltea el fin de semana', () => {
    expect(mananaHabil('2026-09-30')).toBe('2026-10-01')
    expect(mananaHabil('2026-10-02')).toBe('2026-10-05')
  })

  it('lista los de hoy y los de mañana hábil, y deja afuera anulados, rechazados y debitados', () => {
    const julio = cuenta({
      id: 'julio',
      bancoNombre: 'Julio',
      saldoActualCentavos: 100_000,
      descubiertoCentavos: 50_000,
    })
    const cordoba = cuenta({ id: 'cordoba', bancoNombre: 'Córdoba', saldoActualCentavos: 500_000 })
    const resultado = vista(
      [
        cheque({
          id: 'hoy',
          direccion: 'emitido',
          estado: 'pendiente',
          fechaPago: HOY,
          montoCentavos: 30_000,
          bancoEmisor: 'Banco Julio',
          destinatario: 'Hoy SA',
          numero: '10',
        }),
        cheque({
          id: 'manana',
          direccion: 'emitido',
          estado: 'pendiente',
          utilizado: true,
          fechaPago: '2026-10-01',
          montoCentavos: 200_000,
          bancoEmisor: 'Julio',
          destinatario: 'Mañana SA',
          numero: '20',
        }),
        cheque({
          id: 'sin-banco',
          direccion: 'emitido',
          estado: 'en_cartera',
          fechaPago: '2026-10-01',
          montoCentavos: 5_000,
          bancoEmisor: 'Santander',
          numero: '30',
        }),
        cheque({
          id: 'vacio',
          direccion: 'emitido',
          estado: 'pendiente',
          fechaPago: '2026-10-01',
          montoCentavos: 1_000,
          bancoEmisor: '   ',
          numero: '31',
        }),
        cheque({ id: 'debitado', direccion: 'emitido', estado: 'debitado', fechaPago: HOY, montoCentavos: 9_000 }),
        cheque({ id: 'anulado', direccion: 'emitido', estado: 'anulado', fechaPago: '2026-10-01', montoCentavos: 9_000 }),
        cheque({ id: 'rechazado', direccion: 'emitido', estado: 'rechazado', fechaPago: HOY, montoCentavos: 9_000 }),
        cheque({ id: 'viernes', direccion: 'emitido', estado: 'pendiente', fechaPago: '2026-10-02', montoCentavos: 7_000 }),
        cheque({ id: 'recibido', direccion: 'recibido', estado: 'en_cartera', fechaPago: HOY, montoCentavos: 8_000 }),
      ],
      [julio, cordoba],
    )

    expect(resultado.prevision.chequesADebitar.filas.map((fila) => fila.id)).toEqual([
      'hoy',
      'manana',
      'sin-banco',
      'vacio',
    ])
    expect(resultado.prevision.chequesADebitar.filas[0]).toMatchObject({
      numero: '10',
      destinatario: 'Hoy SA',
      banco: 'Julio',
      cuando: 'Hoy',
      montoCentavos: 30_000,
    })
    expect(resultado.prevision.chequesADebitar.filas.find((fila) => fila.id === 'sin-banco')?.banco).toBe(
      'Banco sin identificar',
    )
    expect(resultado.prevision.chequesADebitar.filas.find((fila) => fila.id === 'vacio')?.banco).toBe(
      'Banco sin identificar',
    )
    expect(resultado.prevision.chequesADebitar.totalCentavos).toBe(30_000 + 200_000 + 5_000 + 1_000)
    expect(resultado.prevision.chequesADebitar.impactos).toEqual([
      `Después de estos cheques, Julio queda en ${formatoPesos(100_000 - 230_000)}.`,
      `Ojo: Julio se pasa ${formatoPesos(230_000 - 150_000)} del descubierto. Pasá plata desde Córdoba antes de mañana.`,
      'Hay cheques en Banco sin identificar: no los sumé a ningún banco.',
    ])
    expect(resultado.dia.pagosCentavos).toBe(30_000)
    expect(resultado.prevision.semana?.find((fila) => fila.fecha === HOY)?.aPagarCentavos).toBe(30_000)
    expect(resultado.prevision.semana?.find((fila) => fila.fecha === '2026-10-01')?.aPagarCentavos).toBe(
      200_000 + 5_000 + 1_000,
    )
    expect(resultado.prevision.semana?.find((fila) => fila.fecha === '2026-10-02')?.aPagarCentavos).toBe(7_000)
    expect(resultado.vacio).toBe(false)
  })

  it('un sábado se suma al lunes de la semana y no entra en el débito de mañana si hoy es miércoles', () => {
    const resultado = vista([
      cheque({
        id: 'sabado',
        direccion: 'emitido',
        estado: 'pendiente',
        fechaPago: '2026-10-03',
        montoCentavos: 4_000,
        bancoEmisor: 'Córdoba',
      }),
    ])
    expect(resultado.prevision.chequesADebitar.filas).toEqual([])
    expect(resultado.prevision.semana?.find((fila) => fila.fecha === '2026-10-05')?.aPagarCentavos).toBe(4_000)
    expect(resultado.dia.pagosCentavos).toBe(0)
  })

  it('si el saldo alcanza, dice en cuánto queda y no avisa descubierto', () => {
    const bancos = armarChequesADebitar({
      hoy: HOY,
      bancos: [
        {
          bancoNombre: 'Julio',
          saldoAhoraCentavos: 500_000,
          descubiertoCentavos: 100_000,
          quedaParaUsarCentavos: 600_000,
        },
      ],
      cheques: [
        cheque({
          id: 'chico',
          direccion: 'emitido',
          estado: 'pendiente',
          fechaPago: '2026-10-01',
          montoCentavos: 100_000,
          bancoEmisor: 'Julio',
        }),
      ],
    })
    expect(bancos.impactos).toEqual([`Después de estos cheques, Julio queda en ${formatoPesos(400_000)}.`])
  })
})
