import { describe, expect, it } from 'vitest'
import { decidirPagoCompromiso, restanteAPagarCentavos, type PagoRegistradoVista } from '../../agenda/domain/pago-compromiso.js'
import {
  montoQueRegistraChequeCartera,
  validarPagoCombinado,
  type CajaParaPago,
  type ChequeParaPago,
} from './pago-combinado.js'
import {
  aplicarTransferenciaHecha,
  aplicarTransferenciaRechazada,
  decidirVinculoTransferencia,
  faltaPagarCentavos,
} from './transferencia-en-firma.js'

const caja = (parcial: Partial<CajaParaPago> = {}): CajaParaPago => ({
  id: 'caja-1',
  nombre: 'Caja principal',
  moneda: 'ARS',
  saldoActualCentavos: 100_000,
  bloqueadaPorCierre: false,
  activa: true,
  ...parcial,
})

const cheque = (parcial: Partial<ChequeParaPago> = {}): ChequeParaPago => ({
  id: 'ch-1',
  numero: '100',
  montoCentavos: 4_000,
  enCartera: true,
  ...parcial,
})

const pagoBase = {
  fecha: '2026-10-01',
  medio: 'transferencia' as const,
  referenciaId: null,
  registradoPor: 'ana',
  registradoAt: null,
}

describe('validarPagoCombinado', () => {
  const base = {
    estado: 'pendiente',
    faltaCentavos: 10_000,
    cajas: [caja()],
    cheques: [cheque()],
  }

  it('rechaza asignar más de lo que falta', () => {
    const resultado = validarPagoCombinado({
      ...base,
      partes: [
        { medio: 'efectivo', cajaId: 'caja-1', montoCentavos: 6_000 },
        { medio: 'efectivo', cajaId: 'caja-1', montoCentavos: 5_000 },
      ],
    })
    expect(resultado).toEqual({ ok: false, error: 'Estás asignando más de lo que falta pagar' })
  })

  it('rechaza una caja sin saldo', () => {
    const resultado = validarPagoCombinado({
      ...base,
      cajas: [caja({ saldoActualCentavos: 1_000 })],
      partes: [{ medio: 'efectivo', cajaId: 'caja-1', montoCentavos: 5_000 }],
    })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toContain('no alcanza')
  })

  it('rechaza un cheque que no está en la cartera', () => {
    const resultado = validarPagoCombinado({
      ...base,
      cheques: [cheque({ enCartera: false })],
      partes: [{ medio: 'cheque_cartera', chequeId: 'ch-1' }],
    })
    expect(resultado).toEqual({
      ok: false,
      error: 'Ese cheque no está en la cartera. Elegí otro.',
    })
  })

  it('un cheque de la cartera menor deja anotado solo su monto', () => {
    const resultado = validarPagoCombinado({
      ...base,
      partes: [{ medio: 'cheque_cartera', chequeId: 'ch-1' }],
    })
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.partes[0]).toMatchObject({ montoARegistrar: 4_000, excedenteCentavos: 0 })
    }
    const monto = montoQueRegistraChequeCartera(4_000, 10_000)
    expect(monto).toBe(4_000)
    const decision = decidirPagoCompromiso(
      { estado: 'pendiente', montoCentavos: 10_000, pagos: [] },
      {
        montoSolicitado: monto,
        fecha: '2026-10-01',
        medio: 'cheque',
        referenciaId: 'ch-1',
        registradoPor: 'ana',
        registradoAt: null,
      },
    )
    expect(decision.tipo).toBe('aplicado')
    if (decision.tipo === 'aplicado') {
      expect(decision.completo).toBe(false)
      expect(decision.estado).toBe('pendiente')
      expect(decision.montoCentavos).toBe(4_000)
    }
  })
})

describe('transferencia parcial en firma', () => {
  const actual = {
    estado: 'pendiente' as const,
    montoCentavos: 10_000,
    pagos: [] as PagoRegistradoVista[],
    transferenciasEnFirma: [],
    transferenciaConfeccionadaId: null as string | null,
  }

  it('reserva el monto, al hacerse paga solo eso y si se rechaza vuelve a faltar', () => {
    const confeccion = decidirVinculoTransferencia(actual, { transferenciaId: 't1', montoCentavos: 4_000 })
    expect(confeccion).toMatchObject({
      ok: true,
      modo: 'parcial',
      estado: 'pendiente',
      transferenciasEnFirma: [{ transferenciaId: 't1', montoCentavos: 4_000 }],
    })
    if (!confeccion.ok) return
    expect(faltaPagarCentavos({ ...actual, transferenciasEnFirma: confeccion.transferenciasEnFirma })).toBe(6_000)

    const hecha = aplicarTransferenciaHecha(
      { ...actual, transferenciasEnFirma: confeccion.transferenciasEnFirma },
      { transferenciaId: 't1', montoCentavos: 4_000, ...pagoBase, registradoPor: 'sistema' },
    )
    expect(hecha.montoRegistrado).toBe(4_000)
    expect(hecha.transferenciasEnFirma).toEqual([])
    expect(hecha.decision.tipo).toBe('aplicado')
    if (hecha.decision.tipo !== 'aplicado') return
    expect(hecha.decision.completo).toBe(false)
    expect(hecha.decision.estado).toBe('pendiente')
    expect(
      faltaPagarCentavos({
        estado: hecha.decision.estado,
        montoCentavos: 10_000,
        pagos: hecha.decision.pagos,
        transferenciasEnFirma: [],
      }),
    ).toBe(6_000)
    expect(
      restanteAPagarCentavos({
        estado: hecha.decision.estado,
        montoCentavos: 10_000,
        pagos: hecha.decision.pagos,
      }),
    ).toBe(6_000)

    const rechazada = aplicarTransferenciaRechazada(
      { ...actual, transferenciasEnFirma: confeccion.transferenciasEnFirma },
      't1',
    )
    expect(rechazada.cambio).toBe(true)
    expect(rechazada.transferenciasEnFirma).toEqual([])
    expect(rechazada.estado).toBe('pendiente')
    expect(faltaPagarCentavos({ ...actual, estado: rechazada.estado, transferenciasEnFirma: [] })).toBe(10_000)
  })

  it('si la transferencia cubre todo, el compromiso queda esperando la firma', () => {
    const confeccion = decidirVinculoTransferencia(actual, { transferenciaId: 't9', montoCentavos: 10_000 })
    expect(confeccion).toMatchObject({
      ok: true,
      modo: 'total',
      estado: 'confeccionada_pendiente_autorizacion',
      transferenciaConfeccionadaId: 't9',
    })
  })
})
