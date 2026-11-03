import { describe, expect, it } from 'vitest'
import { analizarOcasionalesVsEmitidos } from './analisis-ocasionales-emitidos.js'
import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import type { VientriChequeDoc } from './tipos.js'

function ocasional(overrides: Partial<ChequeOcasionalDoc> = {}): ChequeOcasionalDoc {
  return {
    numeroCheque: '020-111-2222-44001234',
    beneficiario: 'Presta Plata',
    beneficiarioNormalizado: 'presta plata',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 500000000,
    fechaVencimiento: '2027-01-15',
    fechaEmision: '2026-10-01',
    estadoCodigo: 0,
    estado: 'Sin estado',
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
    fechaConciliado: null,
    proveedorFinancieroId: null,
    vientriId: 100,
    vientriChqId: null,
    baja: false,
    ...overrides,
  }
}

function emitido(overrides: Partial<VientriChequeDoc> = {}): VientriChequeDoc {
  return {
    clave: 'chq-200',
    direccion: 'emitido',
    tipo: 'fisico',
    numero: '020-111-2222-44001234',
    serie: '44001234',
    bancoId: 20,
    bancoNombre: 'Banco Test',
    montoCentavos: 500000000,
    fechaEmision: '2026-10-01',
    fechaVencimiento: '2027-01-15',
    fechaRecibido: null,
    fechaDeposito: null,
    fechaEntregado: null,
    fechaConciliado: null,
    estado: 'pendiente_debito',
    estadoVientri: 'Pago a proveedor',
    estadoVientriId: 4,
    librador: null,
    entregadoPor: null,
    entregadoA: null,
    destinatario: null,
    idCmpIngreso: null,
    cmpIngresoDesc: null,
    idCmpSalida: null,
    cmpSalidaDesc: null,
    idCmpNdRechazo: null,
    idCmpPagoBanco: null,
    estadoPrevioId: null,
    motivoRechazoId: null,
    facturasIngreso: [],
    facturasEgreso: [],
    fuentes: ['Chq'],
    vientriChqId: 200,
    vientriChqocaId: null,
    baja: false,
    revisar: [],
    fecsys: null,
    ...overrides,
  }
}

describe('analizarOcasionalesVsEmitidos', () => {
  it('detecta match por número exacto', () => {
    const r = analizarOcasionalesVsEmitidos(
      [ocasional()],
      [emitido()],
    )
    expect(r.enAmbos).toBe(1)
    expect(r.soloEnOcasionales).toBe(0)
    expect(r.soloEnEmitidos).toBe(0)
  })

  it('detecta match por vientriChqocaId', () => {
    const r = analizarOcasionalesVsEmitidos(
      [ocasional({ numeroCheque: 'distinto' })],
      [emitido({ vientriChqocaId: 100 })],
    )
    expect(r.enAmbos).toBe(1)
    expect(r.soloEnOcasionales).toBe(0)
  })

  it('detecta ocasional sin emitido', () => {
    const r = analizarOcasionalesVsEmitidos(
      [ocasional({ numeroCheque: '999-999', vientriId: 50 })],
      [emitido()],
    )
    expect(r.soloEnOcasionales).toBe(1)
    expect(r.ocasionalesSinEmitido[0].vientriId).toBe(50)
  })

  it('detecta emitido sin ocasional', () => {
    const r = analizarOcasionalesVsEmitidos(
      [ocasional()],
      [emitido(), emitido({ clave: 'chq-300', numero: '888-888' })],
    )
    expect(r.soloEnEmitidos).toBe(1)
    expect(r.emitidosSinOcasional[0].clave).toBe('chq-300')
  })

  it('ignora bajas y recibidos', () => {
    const r = analizarOcasionalesVsEmitidos(
      [ocasional({ baja: true }), ocasional({ vientriId: 101, numeroCheque: '111' })],
      [emitido({ direccion: 'recibido' }), emitido({ clave: 'chq-301', numero: '111' })],
    )
    expect(r.totalOcasionales).toBe(1)
    expect(r.totalEmitidos).toBe(1)
    expect(r.enAmbos).toBe(1)
  })

  it('match por serie + monto cuando el número completo difiere', () => {
    const r = analizarOcasionalesVsEmitidos(
      [ocasional({ numeroCheque: '020-111-2222-44009999' })],
      [emitido({ numero: '999-999-9999-44009999', serie: '44009999' })],
    )
    expect(r.enAmbos).toBe(1)
  })
})
