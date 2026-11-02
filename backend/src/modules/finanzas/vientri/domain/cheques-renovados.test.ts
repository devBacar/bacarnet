import { describe, expect, it } from 'vitest'
import { marcarRenovadosPorCadena } from './cheques-renovados.js'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import type { VientriChequeDoc } from './tipos.js'

function oca(overrides: Partial<ChequeOcasionalDoc> = {}): ChequeOcasionalDoc {
  return {
    numeroCheque: '44001234',
    beneficiario: 'Presta Plata',
    beneficiarioNormalizado: 'presta plata',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 500000000,
    fechaVencimiento: '2027-01-15',
    fechaEmision: '2026-10-01',
    fechaConciliado: null,
    estadoCodigo: 0,
    estado: 'En cartera',
    pagado: false,
    esProveedorFinanciero: true,
    tipoProveedor: 'financiero',
    esRenovacion: false,
    renovacionDe: [],
    renovadoPor: [],
    operacionUsd: null,
    tasaExplicita: null,
    rolEnOperacion: null,
    obsOriginal: '',
    revisar: [],
    vientriId: 1,
    vientriChqId: null,
    baja: false,
    ...overrides,
  }
}

function cheque(overrides: Partial<VientriChequeDoc> = {}): VientriChequeDoc {
  return {
    clave: 'oca-1',
    direccion: 'emitido',
    tipo: 'fisico',
    numero: '44001234',
    serie: '44001234',
    bancoId: null,
    bancoNombre: null,
    montoCentavos: 500000000,
    fechaEmision: '2026-10-01',
    fechaVencimiento: '2027-01-15',
    fechaRecibido: null,
    fechaDeposito: null,
    fechaEntregado: null,
    fechaConciliado: null,
    estado: 'en_cartera',
    estadoVientri: 'Pendiente (cheques propios)',
    estadoVientriId: 0,
    librador: null,
    entregadoPor: null,
    entregadoA: null,
    destinatario: 'Presta Plata',
    idCmpIngreso: null,
    cmpIngresoDesc: null,
    idCmpSalida: null,
    cmpSalidaDesc: null,
    idCmpNdRechazo: null,
    idCmpPagoBanco: null,
    estadoPrevioId: null,
    motivoRechazoId: null,
    fuentes: ['CHQOCA'],
    vientriChqId: null,
    vientriChqocaId: 1,
    baja: false,
    revisar: [],
    fecsys: null,
    ...overrides,
  }
}

describe('marcarRenovadosPorCadena', () => {
  it('cierra (renovado) un cheque ocasional que ya fue reemplazado por uno nuevo', () => {
    const ocasionales = [
      oca({ numeroCheque: 'CHQ-A', vientriId: 1, montoCentavos: 500000000, renovadoPor: ['CHQ-B'] }),
      oca({ numeroCheque: 'CHQ-B', vientriId: 2, montoCentavos: 580000000, renovacionDe: ['CHQ-A'] }),
    ]
    const cheques = [cheque({ clave: 'oca-1', numero: 'CHQ-A', estado: 'en_cartera' })]

    const r = marcarRenovadosPorCadena(cheques, ocasionales)

    expect(r[0]!.estado).toBe('renovado')
  })

  it('deja pendiente el último eslabón de la cadena (el que todavía no se pagó ni se renovó más)', () => {
    const ocasionales = [
      oca({ numeroCheque: 'CHQ-A', vientriId: 1, montoCentavos: 500000000, renovadoPor: ['CHQ-B'] }),
      oca({ numeroCheque: 'CHQ-B', vientriId: 2, montoCentavos: 580000000, renovacionDe: ['CHQ-A'] }),
    ]
    const cheques = [cheque({ clave: 'oca-2', numero: 'CHQ-B', estado: 'pendiente_debito' })]

    const r = marcarRenovadosPorCadena(cheques, ocasionales)

    expect(r[0]!.estado).toBe('pendiente_debito')
  })

  it('no toca un cheque que no aparece en ninguna cadena (nunca cierra por las dudas)', () => {
    const ocasionales = [oca({ numeroCheque: 'CHQ-SOLO', vientriId: 1 })]
    const cheques = [cheque({ clave: 'oca-1', numero: 'CHQ-SOLO', estado: 'en_cartera' })]

    const r = marcarRenovadosPorCadena(cheques, ocasionales)

    expect(r[0]!.estado).toBe('en_cartera')
  })

  it('no toca cheques que ya están debitados/anulados aunque figuren en una cadena', () => {
    const ocasionales = [
      oca({ numeroCheque: 'CHQ-A', vientriId: 1, montoCentavos: 500000000, renovadoPor: ['CHQ-B'] }),
      oca({ numeroCheque: 'CHQ-B', vientriId: 2, montoCentavos: 580000000, renovacionDe: ['CHQ-A'] }),
    ]
    const cheques = [cheque({ clave: 'oca-1', numero: 'CHQ-A', estado: 'debitado' })]

    const r = marcarRenovadosPorCadena(cheques, ocasionales)

    expect(r[0]!.estado).toBe('debitado')
  })

  it('también cierra cheques que vienen de la tabla Chq, no solo de CHQOCA', () => {
    const ocasionales = [
      oca({ numeroCheque: 'CHQ-A', vientriId: 1, montoCentavos: 500000000, renovadoPor: ['CHQ-B'] }),
      oca({ numeroCheque: 'CHQ-B', vientriId: 2, montoCentavos: 580000000, renovacionDe: ['CHQ-A'] }),
    ]
    const cheques = [cheque({ clave: 'chq-1', numero: 'CHQ-A', estado: 'en_cartera' })]

    const r = marcarRenovadosPorCadena(cheques, ocasionales)

    expect(r[0]!.estado).toBe('renovado')
  })
})
