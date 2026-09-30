import { describe, expect, it } from 'vitest'
import type { SaldoDiarioCashflow } from '../../cashflow/domain/cashflow.js'
import {
  agruparLineasCaja,
  armarColumnaCheques,
  armarEfectivoDia,
  chequeUsadoElDia,
  controlArrancaLineasSaldo,
  resolverSaldosColumnaBanco,
  type ChequeParaCaja,
} from './caja-dia.js'

function saldo(parcial: Partial<SaldoDiarioCashflow> & Pick<SaldoDiarioCashflow, 'fecha' | 'saldoFinCentavos'>): SaldoDiarioCashflow {
  return {
    cuentaId: 'cc',
    estado: 'cerrado',
    saldoInicioCentavos: null,
    ...parcial,
  }
}

function cheque(parcial: Partial<ChequeParaCaja> & Pick<ChequeParaCaja, 'id'>): ChequeParaCaja {
  return {
    tipo: 'fisico',
    direccion: 'recibido',
    estado: 'en_cartera',
    utilizado: null,
    montoCentavos: 10_000,
    fechaRecibido: null,
    observaciones: null,
    cliente: 'Acme',
    emisor: 'Acme SA',
    destinatario: null,
    actualizadoFecha: null,
    ...parcial,
  }
}

describe('agrupación de líneas', () => {
  it('junta el mismo detalle y el mismo signo, y separa el signo contrario', () => {
    const lineas = agruparLineasCaja([
      { id: 'a', detalle: 'cliente', origen: 'sugerido', centavos: 100, textoBanco: 'COBRO A' },
      { id: 'b', detalle: 'cliente', origen: 'sugerido', centavos: 50, textoBanco: 'COBRO B' },
      { id: 'c', detalle: 'cliente', origen: 'sugerido', centavos: -20, textoBanco: 'DEV' },
    ])
    expect(lineas).toEqual([
      {
        detalle: 'cliente',
        centavos: 150,
        cantidad: 2,
        movimientoIds: ['a', 'b'],
        origen: 'sugerido',
        textoBanco: null,
      },
      {
        detalle: 'cliente',
        centavos: -20,
        cantidad: 1,
        movimientoIds: ['c'],
        origen: 'sugerido',
        textoBanco: 'DEV',
      },
    ])
  })

  it('si alguno sigue sugerido, la línea no queda como manual', () => {
    const [linea] = agruparLineasCaja([
      { id: 'a', detalle: 'arca', origen: 'manual', centavos: -10, textoBanco: 'VEP' },
      { id: 'b', detalle: 'arca', origen: 'sugerido', centavos: -5, textoBanco: 'VEP' },
    ])
    expect(linea.origen).toBe('sugerido')
    expect(linea.textoBanco).toBe('VEP')
    expect(linea.centavos).toBe(-15)
  })
})

describe('control arranca + líneas = saldo', () => {
  it('cuadra cuando la suma da el saldo', () => {
    expect(
      controlArrancaLineasSaldo({ arrancaCentavos: 1_000, lineasCentavos: -250, saldoCentavos: 750 }),
    ).toEqual({ diferenciaCentavos: 0, esRedondeo: false, cuadra: true })
  })

  it('marca el redondeo de menos de un peso y no lo da por cerrado', () => {
    const cuadre = controlArrancaLineasSaldo({
      arrancaCentavos: 1_000,
      lineasCentavos: -100,
      saldoCentavos: 850,
    })
    expect(cuadre.cuadra).toBe(false)
    expect(cuadre.esRedondeo).toBe(true)
    expect(cuadre.diferenciaCentavos).toBe(-50)
  })

  it('sin arranque no inventa una diferencia', () => {
    expect(
      controlArrancaLineasSaldo({ arrancaCentavos: null, lineasCentavos: 10, saldoCentavos: 10 }),
    ).toEqual({ diferenciaCentavos: null, esRedondeo: false, cuadra: false })
  })
})

describe('saldos de la columna del banco', () => {
  it('un día cerrado arranca con el cierre hábil anterior e ignora el fin de semana', () => {
    const resuelto = resolverSaldosColumnaBanco({
      fecha: '2026-09-28',
      hoy: '2026-09-30',
      docs: [
        saldo({ fecha: '2026-09-25', saldoFinCentavos: 100 }),
        saldo({ fecha: '2026-09-26', saldoFinCentavos: 999 }),
        saldo({ fecha: '2026-09-28', saldoFinCentavos: 150 }),
      ],
      cierre15Anterior: { saldoCentavos: 1 },
      cierre15Dia: { saldoCentavos: 2 },
      entradasCentavos: 80,
      salidasCentavos: 30,
    })
    expect(resuelto.origenSaldo).toBe('banco')
    expect(resuelto.arrancaCentavos).toBe(100)
    expect(resuelto.saldoCentavos).toBe(150)
    expect(resuelto.faltanteCentavos).toBe(0)
  })

  it('hoy usa el saldo con que el banco dice que arrancó el día', () => {
    const resuelto = resolverSaldosColumnaBanco({
      fecha: '2026-09-30',
      hoy: '2026-09-30',
      docs: [
        saldo({ fecha: '2026-09-29', saldoFinCentavos: 400 }),
        saldo({
          fecha: '2026-09-30',
          estado: 'en_curso',
          saldoInicioCentavos: 500,
          saldoFinCentavos: 480,
        }),
      ],
      cierre15Anterior: null,
      cierre15Dia: null,
      entradasCentavos: 0,
      salidasCentavos: 20,
    })
    expect(resuelto.arrancaCentavos).toBe(500)
    expect(resuelto.saldoCentavos).toBe(480)
    expect(resuelto.faltanteCentavos).toBe(0)
  })

  it('si el banco no mandó el día, cae al cierre de las 15', () => {
    const resuelto = resolverSaldosColumnaBanco({
      fecha: '2026-09-30',
      hoy: '2026-09-30',
      docs: [],
      cierre15Anterior: { saldoCentavos: 1_000 },
      cierre15Dia: { saldoCentavos: 900 },
      entradasCentavos: 0,
      salidasCentavos: 0,
    })
    expect(resuelto).toEqual({
      arrancaCentavos: 1_000,
      saldoCentavos: 900,
      origenSaldo: 'cierre15',
      faltanteCentavos: 0,
    })
  })

  it('avisa el faltante cuando el saldo no cierra con los movimientos', () => {
    const resuelto = resolverSaldosColumnaBanco({
      fecha: '2026-09-29',
      hoy: '2026-09-30',
      docs: [
        saldo({ fecha: '2026-09-28', saldoFinCentavos: 1_000_00 }),
        saldo({ fecha: '2026-09-29', saldoFinCentavos: 800_00 }),
      ],
      cierre15Anterior: null,
      cierre15Dia: null,
      entradasCentavos: 0,
      salidasCentavos: 100_00,
    })
    expect(resuelto.arrancaCentavos).toBe(1_000_00)
    expect(resuelto.faltanteCentavos).toBe(-100_00)
  })
})

describe('cheques y efectivo', () => {
  it('la cartera suma recibidos no utilizados e ignora el entregado', () => {
    const columna = armarColumnaCheques(
      [
        cheque({ id: 'en-mano', montoCentavos: 100 }),
        cheque({ id: 'echeq', tipo: 'echeq', montoCentavos: 50 }),
        cheque({ id: 'depositado', estado: 'depositado', utilizado: true, montoCentavos: 80 }),
        cheque({ id: 'endosado', utilizado: true, destinatario: 'Proveedor', montoCentavos: 70 }),
        cheque({ id: 'vendido', estado: 'vendido', montoCentavos: 60 }),
      ],
      '2026-09-30',
      'fisico',
    )
    expect(columna.saldoCentavos).toBe(100)
    expect(columna.lineas).toEqual([])
  })

  it('recibido hoy suma y usado hoy resta; el del Excel no se fecha solo', () => {
    const excel = cheque({
      id: 'excel',
      fechaRecibido: '2026-09-30',
      estado: 'depositado',
      utilizado: true,
      observaciones: 'Utilizado 2026-08-27',
      actualizadoFecha: '2026-09-30',
      montoCentavos: 40,
    })
    expect(chequeUsadoElDia(excel, '2026-09-30')).toBe(false)

    const endoso = cheque({
      id: 'endoso',
      utilizado: true,
      destinatario: 'Flete Sur',
      actualizadoFecha: '2026-09-30',
      fechaRecibido: '2026-09-01',
      montoCentavos: 25,
    })
    const columna = armarColumnaCheques(
      [
        cheque({ id: 'nuevo', fechaRecibido: '2026-09-30', cliente: 'Norte', montoCentavos: 15 }),
        excel,
        endoso,
      ],
      '2026-09-30',
      'fisico',
    )
    expect(columna.saldoCentavos).toBe(15)
    expect(columna.lineas).toEqual([
      { detalle: 'norte', centavos: 15, cantidad: 1 },
      { detalle: 'acme', centavos: 40, cantidad: 1 },
      { detalle: 'flete sur', centavos: -25, cantidad: 1 },
    ])

    const echeq = armarColumnaCheques(
      [cheque({ id: 'e', tipo: 'echeq', fechaRecibido: '2026-09-30', montoCentavos: 9 })],
      '2026-09-30',
      'echeq',
    )
    expect(echeq.saldoCentavos).toBe(9)
    expect(echeq.lineas).toEqual([{ detalle: 'acme', centavos: 9, cantidad: 1 }])
  })

  it('en efectivo, arranca más los movimientos del día da el saldo', () => {
    const efectivo = armarEfectivoDia({
      fecha: '2026-09-30',
      cajas: [
        {
          saldoActualCentavos: 1_000,
          movimientos: [
            { fecha: '2026-09-30', deltaCentavos: -200, concepto: 'viaticos' },
            { fecha: '2026-09-30', deltaCentavos: -50, concepto: 'viaticos' },
            { fecha: '2026-10-01', deltaCentavos: -100, concepto: 'despues' },
          ],
        },
      ],
    })
    expect(efectivo.lineas).toEqual([{ detalle: 'viaticos', centavos: -250, cantidad: 2 }])
    expect(efectivo.saldoCentavos).toBe(1_100)
    expect(efectivo.arrancaCentavos).toBe(1_350)
    expect(efectivo.arrancaCentavos + efectivo.lineas[0].centavos).toBe(efectivo.saldoCentavos)
  })
})
