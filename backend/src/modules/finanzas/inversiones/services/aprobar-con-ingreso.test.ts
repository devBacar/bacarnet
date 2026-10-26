import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validarCondiciones } from '../domain/condiciones.js'
import { generarCronograma } from '../domain/cronograma.js'
import { CONFIG_INVERSIONES_DEFAULT, type InversionDocumentBase } from '../domain/inversion.types.js'
import { ErrorValidacion } from '../domain/validar.js'

/**
 * Aprobar con ingreso opcional: la caja no es atómica con la aprobación.
 * Mocks mínimos para no tocar Firestore ni Caja reales.
 */

function invPendiente(): InversionDocumentBase {
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
    estado: 'pendiente_aprobacion',
    cronograma: generarCronograma(cond),
    ingresos: [],
    aprobacion: {
      solicitadaPor: 'u0',
      solicitadaPorNombre: 'Op',
      solicitadaAt: '2026-01-09T12:00:00.000Z',
      resueltaPor: null,
      resueltaPorNombre: null,
      resueltaAt: null,
      resultado: null,
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

import { aprobarInversion } from './inversiones.service.js'

const lider = { uid: 'u1', displayName: 'Líder', permissions: { finanzas_inversiones_aprobar: true } } as never

const ingresoEfectivo = {
  clave: 'clave-0001',
  medio: 'efectivo' as const,
  fecha: '2026-01-10',
  montoCentavos: 100_000,
  cajaId: 'caja-1',
}

beforeEach(() => {
  doc = invPendiente()
  mocks.getCajaDoc.mockReset()
  mocks.registerMovimiento.mockReset()
  mocks.reservarIngresoCaja.mockReset()
  mocks.cerrarReservaCaja.mockReset()
  mocks.movimientoCajaPorClave.mockReset()
  mocks.getCajaDoc.mockResolvedValue({ id: 'caja-1', moneda: 'ARS', estado: 'activa', tipo: 'principal', nombre: 'Caja ARS' })
  mocks.reservarIngresoCaja.mockResolvedValue({ tipo: 'nueva' })
  mocks.cerrarReservaCaja.mockResolvedValue(undefined)
  mocks.movimientoCajaPorClave.mockResolvedValue(null)
})

describe('aprobarInversion con ingreso opcional', () => {
  it('sin ingreso: aprueba y queda vigente (compat string / {nota})', async () => {
    const a = await aprobarInversion('x', null, lider)
    expect(a.estado).toBe('vigente')
    expect(a).not.toHaveProperty('ingresoError')
    expect(doc.estado).toBe('vigente')
    expect(doc.ingresos).toHaveLength(0)

    doc = invPendiente()
    const b = await aprobarInversion('x', { nota: 'ok' }, lider)
    expect(b.estado).toBe('vigente')
    expect(doc.aprobacion?.nota).toBe('ok')
  })

  it('con ingreso inválido: error y NO se aprueba', async () => {
    await expect(
      aprobarInversion('x', { ingreso: { clave: 'corta', medio: 'transferencia', fecha: '2026-01-10', montoCentavos: 1 } }, lider),
    ).rejects.toThrow(ErrorValidacion)
    expect(doc.estado).toBe('pendiente_aprobacion')

    await expect(
      aprobarInversion(
        'x',
        { ingreso: { clave: 'clave-0001', medio: 'efectivo', fecha: '2026-01-10', montoCentavos: 1 } },
        lider,
      ),
    ).rejects.toThrow('caja')
    expect(doc.estado).toBe('pendiente_aprobacion')

    mocks.getCajaDoc.mockResolvedValueOnce(null)
    await expect(aprobarInversion('x', { ingreso: ingresoEfectivo }, lider)).rejects.toThrow('caja')
    expect(doc.estado).toBe('pendiente_aprobacion')
  })

  it('con ingreso que falla en caja: queda vigente + ingresoError', async () => {
    mocks.registerMovimiento.mockRejectedValue(new Error('La caja está cerrada.'))
    const r = await aprobarInversion('x', { nota: 'listo', ingreso: ingresoEfectivo }, lider)
    expect(doc.estado).toBe('vigente')
    expect(r.estado).toBe('vigente')
    expect((r as { ingresoError?: string }).ingresoError).toMatch(/caja|No pude cargar/i)
    expect(doc.ingresos).toHaveLength(0)
  })
})
