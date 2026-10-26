import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validarCondiciones } from '../domain/condiciones.js'
import { generarCronograma } from '../domain/cronograma.js'
import { CONFIG_INVERSIONES_DEFAULT, type InversionDocumentBase } from '../domain/inversion.types.js'

/**
 * Reintento de ingreso en efectivo con clave nueva tras falla post-caja:
 * no debe duplicar el movimiento si hay una reserva huérfana coincidente.
 */

function invVigente(): InversionDocumentBase {
  const cond = validarCondiciones(
    {
      moneda: 'ARS',
      capitalCentavos: 100_000,
      fechaAlta: '2026-01-10',
      sistema: 'frances',
      periodicidad: 'mensual',
      cantidadCuotas: 2,
      fechaVencimiento: null,
      tasa: { tipo: 'fija', tnaPct: 0 },
      baseDias: null,
      medioIngresoPrevisto: 'efectivo',
      mediosDevolucion: ['efectivo'],
      penalidadPrecancelacion: null,
    },
    CONFIG_INVERSIONES_DEFAULT,
  )
  return {
    ...cond,
    numero: 'INV-0001',
    inversorId: 'i1',
    inversorNombre: 'Perez Ana',
    estado: 'vigente',
    cronograma: generarCronograma(cond),
    ingresos: [],
    aprobacion: {
      solicitadaPor: 'u0',
      solicitadaPorNombre: 'Op',
      solicitadaAt: '2026-01-09T12:00:00.000Z',
      resueltaPor: 'u1',
      resueltaPorNombre: 'Líder',
      resueltaAt: '2026-01-09T13:00:00.000Z',
      resultado: 'aprobada',
      nota: null,
    },
    operacionPendiente: null,
    renovacionDe: null,
    renovadaEn: null,
    versionCronograma: 1,
    indiceAlta: null,
    observaciones: null,
    importada: false,
  }
}

let doc: InversionDocumentBase

const mocks = vi.hoisted(() => ({
  getCajaDoc: vi.fn(),
  registerMovimiento: vi.fn(),
  reservarIngresoCaja: vi.fn(),
  cerrarReservaCaja: vi.fn(),
  movimientoCajaPorClave: vi.fn(),
  reservasCajaHechas: vi.fn(),
  movimientoCajaDatos: vi.fn(),
}))

vi.mock('../../../../lib/firebase/admin.js', () => ({
  adminDb: () => ({
    collection: () => ({ doc: () => ({ id: 'h1', collection: () => ({ doc: () => ({ id: 'h1' }) }) }) }),
  }),
}))

vi.mock('./agenda-inversiones.js', () => ({
  transicionConAgenda: vi.fn(async (_id: string, _uid: string, fn: (inv: InversionDocumentBase) => { data: InversionDocumentBase; historial: unknown }) => {
    const r = fn(doc)
    doc = r.data
    return []
  }),
}))

vi.mock('./inversiones.repository.js', async (original) => ({
  ...(await original<typeof import('./inversiones.repository.js')>()),
  getInversionDoc: vi.fn(async () => doc),
  listHistorial: vi.fn(async () => []),
  compromisosDeCuotas: vi.fn(async () => new Map()),
  reservarIngresoCaja: mocks.reservarIngresoCaja,
  cerrarReservaCaja: mocks.cerrarReservaCaja,
  movimientoCajaPorClave: mocks.movimientoCajaPorClave,
  reservasCajaHechas: mocks.reservasCajaHechas,
  movimientoCajaDatos: mocks.movimientoCajaDatos,
}))

vi.mock('./inversores.repository.js', async (original) => ({
  ...(await original<typeof import('./inversores.repository.js')>()),
  getConfigInversiones: async () => CONFIG_INVERSIONES_DEFAULT,
  getInversorDoc: async () => ({
    nombre: 'Perez Ana',
    estado: 'activo',
    inscriptoGanancias: null,
  }),
}))

vi.mock('../../cajachica/services/caja.repository.js', () => ({
  getCajaDoc: mocks.getCajaDoc,
}))

vi.mock('../../cajachica/services/caja.service.js', () => ({
  registerMovimiento: mocks.registerMovimiento,
}))

import { registrarIngreso } from './inversiones.service.js'

const op = { uid: 'u1', displayName: 'Op', permissions: { finanzas_inversiones: true } } as never

const ingresoBase = {
  medio: 'efectivo' as const,
  fecha: '2026-01-10',
  montoCentavos: 100_000,
  cajaId: 'caja-1',
}

beforeEach(() => {
  doc = invVigente()
  mocks.getCajaDoc.mockReset()
  mocks.registerMovimiento.mockReset()
  mocks.reservarIngresoCaja.mockReset()
  mocks.cerrarReservaCaja.mockReset()
  mocks.movimientoCajaPorClave.mockReset()
  mocks.reservasCajaHechas.mockReset()
  mocks.movimientoCajaDatos.mockReset()
  mocks.getCajaDoc.mockResolvedValue({ id: 'caja-1', moneda: 'ARS', estado: 'activa', tipo: 'principal', nombre: 'Caja ARS' })
  mocks.reservarIngresoCaja.mockResolvedValue({ tipo: 'nueva' })
  mocks.cerrarReservaCaja.mockResolvedValue(undefined)
  mocks.movimientoCajaPorClave.mockResolvedValue(null)
  mocks.reservasCajaHechas.mockResolvedValue([])
  mocks.movimientoCajaDatos.mockResolvedValue(null)
  mocks.registerMovimiento.mockResolvedValue({ id: 'mov-nuevo' })
})

describe('registrarIngreso efectivo: reuso de movimiento huérfano', () => {
  it('reintento con clave nueva tras falla de la transacción → reusa el movimiento (registerMovimiento 1 sola vez)', async () => {
    // Primer intento: carga caja, cierra reserva, falla la transacción (ingresos vacíos).
    mocks.registerMovimiento.mockResolvedValueOnce({ id: 'mov-huerfano' })
    const { transicionConAgenda } = await import('./agenda-inversiones.js')
    vi.mocked(transicionConAgenda).mockRejectedValueOnce(new Error('falló la transacción'))

    await expect(registrarIngreso('x', { ...ingresoBase, clave: 'clave-0001' }, op)).rejects.toThrow('falló la transacción')
    expect(mocks.registerMovimiento).toHaveBeenCalledTimes(1)
    expect(mocks.cerrarReservaCaja).toHaveBeenCalledWith('x', 'clave-0001', 'mov-huerfano')
    expect(doc.ingresos).toHaveLength(0)

    // Reintento con clave nueva: hay reserva huérfana coincidente → no carga de nuevo.
    vi.mocked(transicionConAgenda).mockImplementation(async (_id, _uid, fn) => {
      const r = fn(doc)
      doc = r.data
      return []
    })
    mocks.reservasCajaHechas.mockResolvedValue([{ clave: 'clave-0001', cajaMovimientoId: 'mov-huerfano' }])
    mocks.movimientoCajaDatos.mockResolvedValue({
      cajaId: 'caja-1',
      montoCentavos: 100_000,
      fechaYmd: '2026-01-10',
    })

    await registrarIngreso('x', { ...ingresoBase, clave: 'clave-0002' }, op)

    expect(mocks.registerMovimiento).toHaveBeenCalledTimes(1)
    expect(mocks.cerrarReservaCaja).toHaveBeenCalledWith('x', 'clave-0002', 'mov-huerfano')
    expect(doc.ingresos).toHaveLength(1)
    expect(doc.ingresos[0].cajaMovimientoId).toBe('mov-huerfano')
    expect(doc.ingresos[0].id).toBe('clave-0002')
  })

  it('huérfana con otro monto → carga uno nuevo', async () => {
    mocks.reservasCajaHechas.mockResolvedValue([{ clave: 'clave-vieja', cajaMovimientoId: 'mov-otro' }])
    mocks.movimientoCajaDatos.mockResolvedValue({
      cajaId: 'caja-1',
      montoCentavos: 50_000,
      fechaYmd: '2026-01-10',
    })

    await registrarIngreso('x', { ...ingresoBase, clave: 'clave-0003' }, op)

    expect(mocks.registerMovimiento).toHaveBeenCalledTimes(1)
    expect(mocks.cerrarReservaCaja).toHaveBeenCalledWith('x', 'clave-0003', 'mov-nuevo')
    expect(doc.ingresos[0].cajaMovimientoId).toBe('mov-nuevo')
  })

  it('caso normal sin huérfanas → sin cambios (carga un movimiento)', async () => {
    await registrarIngreso('x', { ...ingresoBase, clave: 'clave-0004' }, op)

    expect(mocks.reservasCajaHechas).toHaveBeenCalledWith('x')
    expect(mocks.registerMovimiento).toHaveBeenCalledTimes(1)
    expect(mocks.cerrarReservaCaja).toHaveBeenCalledWith('x', 'clave-0004', 'mov-nuevo')
    expect(doc.ingresos).toHaveLength(1)
    expect(doc.ingresos[0].cajaMovimientoId).toBe('mov-nuevo')
  })
})
