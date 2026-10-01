import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TransferenciaHttpError } from '../domain/confeccion-directa.rules.js'

const {
  getCuentaDocument,
  beginIdempotentConfeccion,
  abortIdempotentConfeccion,
  createTransferenciaWithHistorial,
  getTransferenciaDocument,
  timestampNow,
  getFinanzasTransferenciasProvider,
  resolveFinanzasTransferenciasProviderMode,
  registrarUsoDestinatario,
  confeccionarLote,
} = vi.hoisted(() => ({
  getCuentaDocument: vi.fn(),
  beginIdempotentConfeccion: vi.fn(),
  abortIdempotentConfeccion: vi.fn(),
  createTransferenciaWithHistorial: vi.fn(),
  getTransferenciaDocument: vi.fn(),
  timestampNow: vi.fn(),
  getFinanzasTransferenciasProvider: vi.fn(),
  resolveFinanzasTransferenciasProviderMode: vi.fn(),
  registrarUsoDestinatario: vi.fn(),
  confeccionarLote: vi.fn(),
}))

vi.mock('../../services/cuentas.repository.js', () => ({ getCuentaDocument }))
vi.mock('./transferencias.repository.js', () => ({
  beginIdempotentConfeccion,
  abortIdempotentConfeccion,
  createTransferenciaWithHistorial,
  getTransferenciaDocument,
  timestampNow,
}))
vi.mock('../adapters/transferencias-provider.factory.js', () => ({
  getFinanzasTransferenciasProvider,
  resolveFinanzasTransferenciasProviderMode,
}))
vi.mock('./destinatarios.service.js', () => ({ registrarUsoDestinatario }))

import { confeccionarTransferenciaDirecta } from './confeccion-directa.service.js'

const CBU_JULIO = '3050001101010001303450'
const KEY = '11111111-2222-4333-8444-555555555555'

const cuentas: Record<string, { tipo: string; moneda: string; bancoNombre: string; saldoActualCentavos: number; descubiertoCentavos: number | null }> = {
  'patagonia-cc': {
    tipo: 'CC',
    moneda: 'ARS',
    bancoNombre: 'Patagonia',
    saldoActualCentavos: 100_000,
    descubiertoCentavos: 50_000,
  },
  'julio-cc': {
    tipo: 'CC',
    moneda: 'ARS',
    bancoNombre: 'Julio',
    saldoActualCentavos: 80_000,
    descubiertoCentavos: null,
  },
}

function bodyTerceros(overrides: Record<string, unknown> = {}) {
  return {
    cuentaDebitoId: 'patagonia-cc',
    tipo: 'terceros',
    destino: { cbu: CBU_JULIO, nombre: 'Acme SA', cuit: '20123456786', tipoCuenta: 'CA' },
    montoCentavos: 10_000,
    concepto: 'Factura 10',
    idempotencyKey: KEY,
    ...overrides,
  }
}

describe('confeccionarTransferenciaDirecta', () => {
  let guardada: { id: string; doc: Record<string, unknown> } | null

  beforeEach(() => {
    guardada = null
    vi.clearAllMocks()
    timestampNow.mockReturnValue({ toDate: () => new Date('2026-09-29T15:00:00.000Z') })
    resolveFinanzasTransferenciasProviderMode.mockReturnValue('mock')
    getFinanzasTransferenciasProvider.mockReturnValue({
      confeccionarLote,
      consultarProceso: vi.fn(),
    })
    confeccionarLote.mockResolvedValue({
      operationId: 'mock-op-1',
      processId: null,
      estadoInmediato: 'confeccionada',
      erroresCodigos: null,
    })
    getCuentaDocument.mockImplementation(async (id: string) => {
      const data = cuentas[id]
      return data ? { id, data } : null
    })
    beginIdempotentConfeccion.mockImplementation(async () => {
      if (guardada) return { kind: 'replay', transferenciaId: guardada.id }
      return { kind: 'start' }
    })
    createTransferenciaWithHistorial.mockImplementation(async (input: { id: string; doc: Record<string, unknown> }) => {
      guardada = { id: input.id, doc: input.doc }
    })
    getTransferenciaDocument.mockImplementation(async (id: string) => {
      if (!guardada || guardada.id !== id) return null
      return {
        id,
        data: {
          ...guardada.doc,
          createdAt: timestampNow(),
          updatedAt: timestampNow(),
        },
      }
    })
    registrarUsoDestinatario.mockResolvedValue('alta')
    abortIdempotentConfeccion.mockResolvedValue(undefined)
  })

  it('no llama al proveedor si la misma clave ya confeccionó', async () => {
    const primera = await confeccionarTransferenciaDirecta({
      actorUid: 'user-1',
      body: bodyTerceros(),
    })
    const segunda = await confeccionarTransferenciaDirecta({
      actorUid: 'user-1',
      body: bodyTerceros(),
    })

    expect(primera.ok).toBe(true)
    expect(segunda.ok).toBe(true)
    if (primera.ok && segunda.ok) {
      expect(segunda.idempotente).toBe(true)
      expect(segunda.transferencia.id).toBe(primera.transferencia.id)
    }
    expect(confeccionarLote).toHaveBeenCalledTimes(1)
    expect(registrarUsoDestinatario).toHaveBeenCalledTimes(1)
    expect(registrarUsoDestinatario).toHaveBeenCalledWith({
      nombre: 'Acme SA',
      cbu: CBU_JULIO,
      cuit: '20123456786',
      tipo: 'terceros',
      tipoCuenta: 'CA',
      actorUid: 'user-1',
    })
    expect(confeccionarLote).toHaveBeenCalledWith([
      expect.objectContaining({ tipo: 'terceros', tipoCuenta: 'CA', cuentaCreditoCbu: CBU_JULIO }),
    ])
  })

  it('responde 409 sin confeccionar cuando el monto supera el disponible', async () => {
    await expect(
      confeccionarTransferenciaDirecta({
        actorUid: 'user-1',
        body: bodyTerceros({ montoCentavos: 150_001 }),
      }),
    ).rejects.toMatchObject({
      status: 409,
      payload: {
        requiereConfirmacion: true,
        disponibleCentavos: 150_000,
      },
    })
    expect(confeccionarLote).not.toHaveBeenCalled()
    expect(beginIdempotentConfeccion).not.toHaveBeenCalled()
  })

  it('confecciona igual si confirman sin fondos', async () => {
    const result = await confeccionarTransferenciaDirecta({
      actorUid: 'user-1',
      body: bodyTerceros({ montoCentavos: 200_000, confirmarSinFondos: true }),
    })
    expect(result.ok).toBe(true)
    expect(confeccionarLote).toHaveBeenCalledTimes(1)
    expect(beginIdempotentConfeccion).toHaveBeenCalledWith(KEY)
  })

  it('suma el destinatario solo cuando la confección sale bien', async () => {
    confeccionarLote.mockResolvedValueOnce({
      operationId: '',
      processId: null,
      estadoInmediato: 'confeccionada',
      erroresCodigos: ['cbu.invalido'],
    })
    const rechazada = await confeccionarTransferenciaDirecta({
      actorUid: 'user-1',
      body: bodyTerceros(),
    })
    expect(rechazada.ok).toBe(false)
    expect(registrarUsoDestinatario).not.toHaveBeenCalled()

    confeccionarLote.mockResolvedValueOnce({
      operationId: 'mock-op-2',
      processId: null,
      estadoInmediato: 'confeccionada',
      erroresCodigos: null,
    })
    beginIdempotentConfeccion.mockResolvedValueOnce({ kind: 'start' })
    const propia = await confeccionarTransferenciaDirecta({
      actorUid: 'user-1',
      body: bodyTerceros({
        tipo: 'cuentas_propias',
        destino: { cuentaId: 'julio-cc' },
        idempotencyKey: '22222222-2222-4333-8444-555555555555',
      }),
    })
    expect(propia.ok).toBe(true)
    if (propia.ok) expect(propia.transferencia.cuentaCreditoCbu).toBe(CBU_JULIO)
    expect(registrarUsoDestinatario).not.toHaveBeenCalled()
  })

  it('traduce el candado del proveedor a 503 y no guarda la transferencia', async () => {
    confeccionarLote.mockRejectedValue(
      new Error('Transferencias reales deshabilitadas: falta INTERBANKING_TRANSFER_ALLOW_REAL=true'),
    )
    await expect(
      confeccionarTransferenciaDirecta({ actorUid: 'user-1', body: bodyTerceros() }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'TransferenciaHttpError',
        status: 503,
        message: 'Las transferencias reales están deshabilitadas en este entorno',
      }),
    )
    expect(abortIdempotentConfeccion).toHaveBeenCalledWith(KEY)
    expect(createTransferenciaWithHistorial).not.toHaveBeenCalled()
    expect(registrarUsoDestinatario).not.toHaveBeenCalled()
  })

  it('no llama al proveedor si el CBU no verifica', async () => {
    await expect(
      confeccionarTransferenciaDirecta({
        actorUid: 'user-1',
        body: bodyTerceros({ destino: { cbu: '123', nombre: 'Ana' } }),
      }),
    ).rejects.toBeInstanceOf(TransferenciaHttpError)
    expect(confeccionarLote).not.toHaveBeenCalled()
  })
})
