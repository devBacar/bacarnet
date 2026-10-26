import { describe, expect, it } from 'vitest'
import { AVISO_CHEQUE_EMITIDO, armarCentroDePagos } from './centro-de-pagos.js'
import type { ChequeEnHoy, CompromisoHoy } from './hoy.tipos.js'

const HOY = '2026-09-30'
const HASTA = '2026-10-08'

function compromiso(
  partial: Partial<CompromisoHoy> & Pick<CompromisoHoy, 'id' | 'fechaVencimiento' | 'montoCentavos'>,
): CompromisoHoy {
  return {
    concepto: 'Factura',
    proveedorONombre: 'Proveedor',
    urgencia: null,
    medioPago: 'transferencia',
    estado: 'pendiente',
    cuentaId: null,
    chequeId: null,
    ...partial,
  }
}

function cheque(partial: Partial<ChequeEnHoy> & Pick<ChequeEnHoy, 'id'>): ChequeEnHoy {
  return {
    numero: '100',
    direccion: 'emitido',
    estado: 'pendiente',
    utilizado: null,
    montoCentavos: 10_000,
    fechaPago: HOY,
    bancoEmisor: 'Patagonia',
    destinatario: 'Destinatario',
    emisor: 'Bacar',
    cliente: null,
    pagoDe: null,
    ...partial,
  }
}

describe('armarCentroDePagos', () => {
  it('atrasado sin cheque: entra marcado atrasado, sin aviso de cheque', () => {
    const centro = armarCentroDePagos({
      hoy: HOY,
      hasta: HASTA,
      compromisos: [
        compromiso({
          id: 'atrasado',
          fechaVencimiento: '2026-09-20',
          montoCentavos: 5_000,
          proveedorONombre: 'Viejo SA',
          estado: 'vencido',
          medioPago: 'transferencia',
        }),
      ],
      cheques: [],
    })
    expect(centro.filas).toHaveLength(1)
    expect(centro.filas[0]).toMatchObject({
      id: 'atrasado',
      aQuien: 'Viejo SA',
      estaAtrasado: true,
      medioPago: 'transferencia',
      chequeEmitido: false,
      chequeNumero: null,
      aviso: null,
      fechaVencimiento: '2026-09-20',
    })
    expect(centro.totalCentavos).toBe(5_000)
  })

  it('atrasado con cheque emitido: aviso de que solo falta debitarlo', () => {
    const centro = armarCentroDePagos({
      hoy: HOY,
      hasta: HASTA,
      compromisos: [
        compromiso({
          id: 'con-cheque',
          fechaVencimiento: '2026-09-15',
          montoCentavos: 8_000,
          proveedorONombre: 'Chequeado SA',
          estado: 'vencido',
          medioPago: 'cheque',
          chequeId: 'ch-1',
        }),
      ],
      cheques: [
        cheque({
          id: 'ch-1',
          numero: '4521',
          fechaPago: '2026-09-15',
          destinatario: 'Chequeado SA',
          montoCentavos: 8_000,
        }),
      ],
    })
    expect(centro.filas).toHaveLength(1)
    expect(centro.filas[0]).toMatchObject({
      id: 'con-cheque',
      estaAtrasado: true,
      medioPago: 'cheque',
      chequeEmitido: true,
      chequeNumero: '4521',
      aviso: AVISO_CHEQUE_EMITIDO,
    })
    // El cheque no se duplica como fila suelta.
    expect(centro.filas.some((fila) => fila.id.startsWith('cheque:'))).toBe(false)
  })

  it('pendiente de hoy: entra sin atrasado', () => {
    const centro = armarCentroDePagos({
      hoy: HOY,
      hasta: HASTA,
      compromisos: [
        compromiso({
          id: 'hoy',
          fechaVencimiento: HOY,
          montoCentavos: 2_000,
          proveedorONombre: 'Hoy SA',
          medioPago: 'efectivo',
        }),
        compromiso({
          id: 'futuro-lejos',
          fechaVencimiento: '2026-11-01',
          montoCentavos: 9_000,
          proveedorONombre: 'Lejos SA',
        }),
      ],
      cheques: [],
    })
    expect(centro.filas.map((fila) => fila.id)).toEqual(['hoy'])
    expect(centro.filas[0]).toMatchObject({
      estaAtrasado: false,
      medioPago: 'efectivo',
      aviso: null,
      chequeEmitido: false,
    })
  })

  it('cheque suelto sin compromiso: entra como fila de cheque emitido', () => {
    const centro = armarCentroDePagos({
      hoy: HOY,
      hasta: HASTA,
      compromisos: [],
      cheques: [
        cheque({
          id: 'suelto',
          numero: '900',
          fechaPago: '2026-09-25',
          destinatario: 'Proveedor suelto',
          montoCentavos: 3_500,
          pagoDe: null,
        }),
        cheque({
          id: 'ya-vinculado',
          numero: '901',
          fechaPago: HOY,
          montoCentavos: 1_000,
          pagoDe: { compromisoId: 'otro', proveedorONombre: 'X', concepto: 'Y' },
        }),
        cheque({
          id: 'debitado',
          numero: '902',
          estado: 'debitado',
          fechaPago: '2026-09-20',
          montoCentavos: 500,
        }),
      ],
    })
    expect(centro.filas).toHaveLength(1)
    expect(centro.filas[0]).toMatchObject({
      id: 'cheque:suelto',
      aQuien: 'Proveedor suelto',
      concepto: 'Cheque N.º 900',
      montoCentavos: 3_500,
      medioPago: 'cheque',
      estaAtrasado: true,
      chequeEmitido: true,
      chequeNumero: '900',
      aviso: AVISO_CHEQUE_EMITIDO,
    })
  })

  it('ordena por fecha de vencimiento: lo más atrasado primero', () => {
    const centro = armarCentroDePagos({
      hoy: HOY,
      hasta: HASTA,
      compromisos: [
        compromiso({ id: 'hoy', fechaVencimiento: HOY, montoCentavos: 100, proveedorONombre: 'B' }),
        compromiso({
          id: 'viejo',
          fechaVencimiento: '2026-09-10',
          montoCentavos: 200,
          proveedorONombre: 'A',
          estado: 'vencido',
        }),
        compromiso({ id: 'semana', fechaVencimiento: '2026-10-02', montoCentavos: 300, proveedorONombre: 'C' }),
      ],
      cheques: [
        cheque({
          id: 'suelto',
          numero: '1',
          fechaPago: '2026-09-05',
          destinatario: 'Z',
          montoCentavos: 50,
        }),
      ],
    })
    expect(centro.filas.map((fila) => fila.id)).toEqual(['cheque:suelto', 'viejo', 'hoy', 'semana'])
  })
})
