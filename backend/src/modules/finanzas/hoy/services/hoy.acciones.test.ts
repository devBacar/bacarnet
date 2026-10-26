import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getCompromisoDocument,
  getChequeById,
  marcarChequeEndosado,
  anotarChequePagoDe,
  chequeDocId,
  ingresarChequesPegados,
  marcarCompromisoYaPagado,
  listCajasForUser,
} = vi.hoisted(() => ({
  getCompromisoDocument: vi.fn(),
  getChequeById: vi.fn(),
  marcarChequeEndosado: vi.fn(),
  anotarChequePagoDe: vi.fn(),
  chequeDocId: vi.fn((direccion: string, numero: string) => `${direccion}_${numero}`),
  ingresarChequesPegados: vi.fn(),
  marcarCompromisoYaPagado: vi.fn(),
  listCajasForUser: vi.fn(),
}))

vi.mock('../../agenda/services/agenda.repository.js', () => ({
  getCompromisoDocument,
  getCobroDocument: vi.fn(),
}))

vi.mock('../../agenda/services/compromisos.service.js', () => ({
  marcarCompromisoYaPagado,
  reprogramarCompromiso: vi.fn(),
}))

vi.mock('../../agenda/services/cobros.service.js', () => ({
  confirmarCobro: vi.fn(),
  reprogramarCobro: vi.fn(),
}))

vi.mock('../../cheques/services/cheques.repository.js', () => ({
  getChequeById,
  marcarChequeEndosado,
  anotarChequePagoDe,
  chequeDocId,
}))

vi.mock('../../cheques/services/cheques.service.js', () => ({
  ingresarChequesPegados,
}))

vi.mock('../../cajachica/services/caja.service.js', () => ({
  listCajasForUser,
  registerMovimiento: vi.fn(),
}))

vi.mock('./hoy.service.js', () => ({
  getMovimientoHoy: vi.fn(),
}))

import {
  pagarCompromisoCombinado,
  pagarCompromisoConChequeDeCartera,
} from './hoy.acciones.js'

const user = { uid: 'u1', email: 'a@b.com' } as never

const compromisoBase = {
  concepto: 'Alquiler local',
  proveedorONombre: 'Inmobiliaria Norte',
  estado: 'pendiente',
  montoCentavos: 50_000,
  pagos: [],
  transferenciasEnFirma: [],
}

describe('hoy.acciones: pagoDe en cheques', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listCajasForUser.mockResolvedValue([])
  })

  it('al endosar un cheque de cartera anota pagoDe en el cheque', async () => {
    getCompromisoDocument.mockResolvedValue(compromisoBase)
    getChequeById.mockResolvedValue({
      id: 'recibido_100',
      numero: '100',
      montoCentavos: 50_000,
      direccion: 'recibido',
      estado: 'en_cartera',
      utilizado: false,
    })
    marcarChequeEndosado.mockResolvedValue(undefined)
    marcarCompromisoYaPagado.mockResolvedValue(undefined)

    await pagarCompromisoConChequeDeCartera({
      user,
      compromisoId: 'cmp-alquiler',
      chequeId: 'recibido_100',
    })

    expect(marcarChequeEndosado).toHaveBeenCalledWith({
      id: 'recibido_100',
      destinatario: 'Inmobiliaria Norte',
      pagoDe: {
        compromisoId: 'cmp-alquiler',
        proveedorONombre: 'Inmobiliaria Norte',
        concepto: 'Alquiler local',
      },
    })
  })

  it('al emitir un cheque propio desde pago combinado completa pagoDe', async () => {
    getCompromisoDocument.mockResolvedValue(compromisoBase)
    ingresarChequesPegados.mockResolvedValue({
      insertados: 1,
      actualizados: 0,
      ignorados: 0,
      duplicados: 0,
      errores: [],
      avisos: [],
    })
    getChequeById.mockResolvedValue({
      id: 'emitido_E-CHEQ-9',
      numero: 'E-CHEQ-9',
      montoCentavos: 50_000,
    })
    anotarChequePagoDe.mockResolvedValue(undefined)
    marcarCompromisoYaPagado.mockResolvedValue(undefined)

    await pagarCompromisoCombinado({
      user,
      compromisoId: 'cmp-alquiler',
      partes: [
        {
          medio: 'cheque_propio',
          montoCentavos: 50_000,
          cheque: {
            tipo: 'echeq',
            numero: 'E-CHEQ-9',
            banco: 'Galicia',
            fechaPago: '2026-11-15',
          },
        },
      ],
      comprobantes: new Map(),
    })

    expect(anotarChequePagoDe).toHaveBeenCalledWith({
      id: 'emitido_E-CHEQ-9',
      pagoDe: {
        compromisoId: 'cmp-alquiler',
        proveedorONombre: 'Inmobiliaria Norte',
        concepto: 'Alquiler local',
      },
      destinatario: 'Inmobiliaria Norte',
    })
    expect(marcarCompromisoYaPagado).toHaveBeenCalledWith(
      'cmp-alquiler',
      'u1',
      expect.objectContaining({
        medioPago: 'cheque',
        chequeId: 'emitido_E-CHEQ-9',
        claseCheque: 'propio',
      }),
    )
  })
})
