import { describe, expect, it, vi } from 'vitest'
import type { DetalleTransferenciaInterbanking } from '../adapters/interbanking-transferencias-details.js'
import type { TransferenciaConfeccionadaDocument } from '../domain/transferencia.types.js'
import { actualizarEstadosTransferencias } from './actualizar-estados.service.js'

function doc(
  overrides: Partial<TransferenciaConfeccionadaDocument> = {},
): TransferenciaConfeccionadaDocument {
  return {
    compromisoPagoId: null,
    origen: 'directa',
    tipo: 'terceros',
    cuentaDebitoId: 'patagonia-cc',
    cuentaCreditoCbu: '3050001101010001303450',
    montoCentavos: 150050,
    concepto: 'Pago',
    disclaimerAceptado: false,
    operationId: 'OP-1',
    processId: null,
    estado: 'confeccionada',
    erroresInterbanking: null,
    confeccionadaPor: 'user-1',
    fechaConfeccion: { toDate: () => new Date('2026-09-29T15:00:00.000Z') } as TransferenciaConfeccionadaDocument['fechaConfeccion'],
    fechaDeteccionEfectivizada: null,
    createdAt: { toDate: () => new Date('2026-09-29T15:00:00.000Z') } as TransferenciaConfeccionadaDocument['createdAt'],
    updatedAt: { toDate: () => new Date('2026-09-29T15:00:00.000Z') } as TransferenciaConfeccionadaDocument['updatedAt'],
    ...overrides,
  }
}

function detalle(status: string): DetalleTransferenciaInterbanking {
  return {
    transferId: '1',
    transactionNumber: null,
    referenceNumber: 'OP-1',
    paymentNumber: null,
    lotNumber: null,
    comments: null,
    status,
    amountCentavos: 150050,
    requestDate: '2026-09-29',
    debitCbu: '0340070800700370037009',
    debitAccountNumber: '20',
    debitBankNumber: '034',
    creditCbu: '3050001101010001303450',
    creditAccountNumber: null,
  }
}

describe('actualizarEstadosTransferencias', () => {
  it('no consulta si no hay transferencias pendientes y no toca la red', async () => {
    const consultar = vi.fn()
    const guardar = vi.fn()
    const resultado = await actualizarEstadosTransferencias({
      deps: {
        listar: async () => [
          { id: 'hecha', data: doc({ estado: 'efectivizada' }) },
          { id: 'final', data: doc({ estadoInterbanking: 'Ejecutada' }) },
        ],
        consultar,
        guardar,
        cbuDebito: () => '0340070800700370037009',
        numeroDebito: () => '20',
      },
    })
    expect(resultado.revisadas).toBe(0)
    expect(consultar).not.toHaveBeenCalled()
    expect(guardar).not.toHaveBeenCalled()
  })

  it('actualiza por operation id y deja historial solo si el estado cambió', async () => {
    const consultar = vi.fn(async () => [detalle('En autorización')])
    const guardar = vi.fn()
    const resultado = await actualizarEstadosTransferencias({
      origen: 'usuario',
      deps: {
        now: new Date('2026-09-29T15:00:00.000Z'),
        listar: async () => [{ id: 't1', data: doc() }],
        consultar,
        guardar,
        cbuDebito: () => '0340070800700370037009',
        numeroDebito: () => '20',
      },
    })
    expect(consultar).toHaveBeenCalledWith('2026-09-29', '2026-09-29')
    expect(resultado).toMatchObject({ revisadas: 1, actualizadas: 1, sinCambio: 0 })
    expect(guardar).toHaveBeenCalledWith(
      expect.objectContaining({
        transferenciaId: 't1',
        registrarHistorial: true,
        estadoInterbanking: 'En autorización',
        fechaSolicitudInterbanking: '2026-09-29',
        historial: expect.objectContaining({
          estadoNuevo: 'Firmada en parte: falta otra firma',
          origen: 'usuario',
        }),
      }),
    )
  })

  it('sin id usa débito, CBU, monto y fecha, y se frena si hay dos iguales', async () => {
    const consultar = vi.fn(async () => [detalle('Autorizada')])
    const guardar = vi.fn()
    const sinId = doc({ operationId: '', confectionId: null })
    const unico = await actualizarEstadosTransferencias({
      deps: {
        now: new Date('2026-09-29T15:00:00.000Z'),
        listar: async () => [{ id: 'solo', data: sinId }],
        consultar,
        guardar,
        cbuDebito: () => '0340070800700370037009',
        numeroDebito: () => '20',
      },
    })
    expect(unico.actualizadas).toBe(1)

    guardar.mockClear()
    const ambiguo = await actualizarEstadosTransferencias({
      deps: {
        now: new Date('2026-09-29T15:00:00.000Z'),
        listar: async () => [
          { id: 'a', data: sinId },
          { id: 'b', data: sinId },
        ],
        consultar,
        guardar,
        cbuDebito: () => '0340070800700370037009',
        numeroDebito: () => '20',
      },
    })
    expect(ambiguo.ambiguas).toBe(2)
    expect(guardar).not.toHaveBeenCalled()
  })

  it('cuando el banco la marca hecha, cierra el pago vinculado', async () => {
    const alQuedarHecha = vi.fn()
    await actualizarEstadosTransferencias({
      deps: {
        now: new Date('2026-09-29T15:00:00.000Z'),
        listar: async () => [
          { id: 't1', data: doc({ compromisoPagoId: 'comp-1', cuentaDebitoId: 'patagonia-cc' }) },
        ],
        consultar: async () => [detalle('Ejecutada')],
        guardar: vi.fn(),
        cbuDebito: () => '0340070800700370037009',
        numeroDebito: () => '20',
        alQuedarHecha,
      },
    })
    expect(alQuedarHecha).toHaveBeenCalledWith({
      compromisoId: 'comp-1',
      cuentaDebitoId: 'patagonia-cc',
      nota: 'La transferencia quedó hecha en el banco.',
    })
  })
})
