import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../lib/firebase/admin.js', () => ({ adminDb: vi.fn() }))

vi.mock('./vientri.repository.js', () => ({
  sincronizarColeccion: vi.fn(async () => ({ nuevos: 2, cambiados: 0, iguales: 0, borrados: 0 })),
}))

// Sin Firestore: los completadores devuelven el pool tal cual
vi.mock('./completar-eslabones-vientri.js', () => ({
  leerActivosConEslabonesDeVientri: vi.fn(async (docs: unknown[]) => docs),
}))
vi.mock('./inyectar-chq-autolink.js', () => ({
  inyectarChqParaAutolink: vi.fn(async (docs: unknown[]) => docs),
}))

import type { ChequeOcasionalDoc } from '../domain/cheque-ocasional.types.js'
import { recalcularSeguimiento, VIENTRI_OPERACIONES_RENOVACION } from './recalcular-seguimiento.js'
import { sincronizarColeccion } from './vientri.repository.js'

const mockSync = vi.mocked(sincronizarColeccion)

function doc(overrides: Partial<ChequeOcasionalDoc>): ChequeOcasionalDoc {
  return {
    numeroCheque: '',
    beneficiario: 'JULIO',
    beneficiarioNormalizado: 'julio',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 100_000_00,
    fechaVencimiento: null,
    fechaEmision: null,
    estadoCodigo: null,
    estado: '',
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
    vientriId: 0,
    vientriChqId: null,
    baja: false,
    ...overrides,
  }
}

const num = (n: number) => `020-923-5000-${String(n).padStart(8, '0')}`

describe('recalcularSeguimiento', () => {
  const viejo = doc({ numeroCheque: num(1), pagado: true, fechaEmision: '2026-01-01', fechaVencimiento: '2026-02-01', obsOriginal: 'origen' })
  const nuevo = doc({ numeroCheque: num(2), esRenovacion: true, renovacionDe: ['00000001'], fechaEmision: '2026-02-01', fechaVencimiento: '2026-03-01' })

  it('persiste las operaciones con su id determinístico en la colección derivada', async () => {
    mockSync.mockClear()
    const r = await recalcularSeguimiento({ docs: [viejo, nuevo], importacionId: 'imp-1' })

    expect(r.operaciones).toBe(1)
    const input = mockSync.mock.calls[0]![0]
    expect(input.coleccion).toBe(VIENTRI_OPERACIONES_RENOVACION)
    expect(input.coleccion).toBe('renovacionesChequesAgrupados')
    expect(input.importacionId).toBe('imp-1')
    expect(input.borrarFaltantes).toBe(false)
    expect(input.simular).toBe(false)
    expect(input.docs).toHaveLength(1)
    expect(input.docs[0]!.id).toBe('renov-julio-2026-02-01-020-923-5000')

    const data = input.docs[0]!.data as { chequesNuevos: Array<{ estado: string }>; exposicionCentavos: number }
    expect(data.chequesNuevos[0]!.estado).toBe('pendiente')
    expect(data.exposicionCentavos).toBe(100_000_00)
  })

  it('excluye cheques con baja', async () => {
    mockSync.mockClear()
    const r = await recalcularSeguimiento({ docs: [viejo, { ...nuevo, baja: true }], importacionId: 'imp-2' })
    expect(r.operaciones).toBe(0)
    expect(mockSync.mock.calls[0]![0].docs).toHaveLength(0)
  })

  it('propaga simular y borrarFaltantes', async () => {
    mockSync.mockClear()
    await recalcularSeguimiento({ docs: [viejo, nuevo], importacionId: 'imp-3', simular: true, borrarFaltantes: true })
    const input = mockSync.mock.calls[0]![0]
    expect(input.simular).toBe(true)
    expect(input.borrarFaltantes).toBe(true)
  })
})
