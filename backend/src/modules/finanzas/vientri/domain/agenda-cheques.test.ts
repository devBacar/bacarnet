import { describe, expect, it } from 'vitest'
import {
  datosDesdeCheque,
  esChequePendienteAgenda,
  idAgendaVientriCheque,
  planAgendaCheques,
  type ExistenteChequeAgenda,
} from './agenda-cheques.js'
import type { VientriChequeDoc } from './tipos.js'

function cheque(p: Partial<VientriChequeDoc>): VientriChequeDoc {
  return {
    clave: 'ch-1',
    direccion: 'emitido',
    tipo: 'echeq',
    numero: '12345',
    serie: 'A',
    bancoId: 1,
    bancoNombre: 'Banco Ficticio',
    montoCentavos: 250_000_00,
    fechaEmision: '2026-09-01',
    fechaVencimiento: '2026-10-15',
    fechaRecibido: null,
    fechaDeposito: null,
    fechaEntregado: null,
    fechaConciliado: null,
    estado: 'en_cartera',
    estadoVientri: 'En cartera',
    estadoVientriId: 1,
    librador: null,
    entregadoPor: null,
    entregadoA: null,
    destinatario: 'Proveedor Ejemplo SA',
    idCmpIngreso: null,
    cmpIngresoDesc: null,
    idCmpSalida: null,
    cmpSalidaDesc: null,
    idCmpNdRechazo: null,
    idCmpPagoBanco: null,
    estadoPrevioId: null,
    motivoRechazoId: null,
    fuentes: ['Chq'],
    vientriChqId: 1,
    vientriChqocaId: null,
    baja: false,
    revisar: [],
    fecsys: null,
    ...p,
  }
}

function ex(p: Partial<ExistenteChequeAgenda>): ExistenteChequeAgenda {
  return {
    id: idAgendaVientriCheque('ch-1'),
    estado: 'pendiente',
    anulado: false,
    fecha: '2026-10-15',
    fechaVientri: '2026-10-15',
    montoCentavos: 250_000_00,
    concepto: 'Cheque A-12345 · Banco Ficticio',
    proveedorONombre: 'Proveedor Ejemplo SA',
    cerradoPorVientri: false,
    ...p,
  }
}

describe('esChequePendienteAgenda', () => {
  it('solo emitidos en_cartera o pendiente_debito con fecha y monto', () => {
    expect(esChequePendienteAgenda(cheque({}))).toBe(true)
    expect(esChequePendienteAgenda(cheque({ estado: 'pendiente_debito' }))).toBe(true)
    expect(esChequePendienteAgenda(cheque({ estado: 'debitado' }))).toBe(false)
    expect(esChequePendienteAgenda(cheque({ estado: 'anulado' }))).toBe(false)
    expect(esChequePendienteAgenda(cheque({ estado: 'rechazado' }))).toBe(false)
    expect(esChequePendienteAgenda(cheque({ estado: 'entregado' }))).toBe(false)
    expect(esChequePendienteAgenda(cheque({ direccion: 'recibido' }))).toBe(false)
    expect(esChequePendienteAgenda(cheque({ baja: true }))).toBe(false)
    expect(esChequePendienteAgenda(cheque({ fechaVencimiento: null }))).toBe(false)
  })
})

describe('datosDesdeCheque', () => {
  it('arma concepto legible con banco, número y destinatario', () => {
    const d = datosDesdeCheque(cheque({}))
    expect(d).toMatchObject({
      concepto: 'Cheque A-12345 · Banco Ficticio',
      proveedorONombre: 'Proveedor Ejemplo SA',
      montoCentavos: 250_000_00,
      fecha: '2026-10-15',
      grupo: 'Bancos',
      medioPago: 'cheque',
    })
    expect(idAgendaVientriCheque('ch-1')).toBe('vientri-cheque-ch-1')
  })
})

describe('planAgendaCheques', () => {
  it('crea compromiso desde cheque pendiente', () => {
    const r = planAgendaCheques({
      enVentana: [cheque({})],
      todosEmitidos: [cheque({})],
      existentes: [],
    })
    expect(r.operaciones).toEqual([
      expect.objectContaining({ tipo: 'crear', id: 'vientri-cheque-ch-1' }),
    ])
  })

  it('no duplica si el compromiso ya existe igual', () => {
    const r = planAgendaCheques({
      enVentana: [cheque({})],
      todosEmitidos: [cheque({})],
      existentes: [ex({})],
    })
    expect(r.operaciones).toEqual([])
  })

  it('marca pagado cuando el cheque se debita', () => {
    const debitado = cheque({ estado: 'debitado' })
    const r = planAgendaCheques({
      enVentana: [debitado],
      todosEmitidos: [debitado],
      existentes: [ex({})],
    })
    expect(r.operaciones).toEqual([
      expect.objectContaining({ tipo: 'cerrar', cierre: 'pagado', id: 'vientri-cheque-ch-1' }),
    ])
  })

  it('anula (baja lógica) cuando el cheque se anula o rechaza', () => {
    const anulado = cheque({ estado: 'anulado' })
    const r = planAgendaCheques({
      enVentana: [anulado],
      todosEmitidos: [anulado],
      existentes: [ex({})],
    })
    expect(r.operaciones).toEqual([
      expect.objectContaining({ tipo: 'cerrar', cierre: 'anulado' }),
    ])

    const rechazado = cheque({ estado: 'rechazado' })
    const r2 = planAgendaCheques({
      enVentana: [rechazado],
      todosEmitidos: [rechazado],
      existentes: [ex({})],
    })
    expect(r2.operaciones[0]).toMatchObject({ tipo: 'cerrar', cierre: 'anulado' })
  })

  it('no pisa la fecha si Finanzas la reprogramó en Bacarnet', () => {
    const vientriCambioFecha = cheque({ fechaVencimiento: '2026-11-01' })
    const reprogramada = planAgendaCheques({
      enVentana: [vientriCambioFecha],
      todosEmitidos: [vientriCambioFecha],
      existentes: [ex({ fecha: '2026-12-01', fechaVientri: '2026-10-15' })],
    })
    expect(reprogramada.operaciones).toEqual([
      expect.objectContaining({ tipo: 'actualizar', cambiarFecha: false }),
    ])

    const sinReprogramar = planAgendaCheques({
      enVentana: [vientriCambioFecha],
      todosEmitidos: [vientriCambioFecha],
      existentes: [ex({ fecha: '2026-10-15', fechaVientri: '2026-10-15' })],
    })
    expect(sinReprogramar.operaciones).toEqual([
      expect.objectContaining({ tipo: 'actualizar', cambiarFecha: true }),
    ])
  })

  it('ignora cheques recibidos y sin fecha', () => {
    const r = planAgendaCheques({
      enVentana: [
        cheque({ clave: 'rec', direccion: 'recibido' }),
        cheque({ clave: 'sf', fechaVencimiento: null }),
      ],
      todosEmitidos: [
        cheque({ clave: 'rec', direccion: 'recibido' }),
        cheque({ clave: 'sf', fechaVencimiento: null }),
      ],
      existentes: [],
    })
    expect(r.operaciones).toEqual([])
    expect(r.sinFecha).toBe(1)
  })
})
