import { describe, expect, it, vi } from 'vitest'
import { validarCondiciones } from '../domain/condiciones.js'
import { generarCronograma } from '../domain/cronograma.js'
import { CONFIG_INVERSIONES_DEFAULT, type InversionDocumentBase } from '../domain/inversion.types.js'
import { transicionConAgenda } from './agenda-inversiones.js'

/** Firestore en memoria, lo justo para una transacción: get, getAll, set y update. */
const base = new Map<string, Record<string, unknown>>()
const escrituras: string[] = []

function refDe(path: string): { id: string; path: string; collection: (n: string) => { doc: () => unknown }; get?: never } {
  return {
    id: path.split('/').at(-1)!,
    path,
    collection: (n: string) => ({ doc: () => refDe(`${path}/${n}/${Math.random().toString(36).slice(2)}`) }),
  }
}

function snap(path: string) {
  const data = base.get(path)
  return { id: path.split('/').at(-1)!, exists: data !== undefined, data: () => data, get: (k: string) => data?.[k] }
}

vi.mock('../../../../lib/firebase/admin.js', () => ({
  adminDb: () => ({
    collection: (c: string) => ({ doc: (id: string) => refDe(`${c}/${id}`) }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (r: { path: string }) => snap(r.path),
        getAll: async (...rs: Array<{ path: string }>) => rs.map((r) => snap(r.path)),
        set: (r: { path: string }, d: Record<string, unknown>) => {
          escrituras.push(r.path)
          base.set(r.path, d)
        },
        update: (r: { path: string }, d: Record<string, unknown>) => {
          escrituras.push(r.path)
          base.set(r.path, { ...base.get(r.path), ...d })
        },
      }),
  }),
}))

function pendiente(): InversionDocumentBase {
  const cond = validarCondiciones(
    {
      moneda: 'USD',
      capitalCentavos: 1_200_000,
      fechaAlta: '2026-01-10',
      sistema: 'frances',
      periodicidad: 'mensual',
      cantidadCuotas: 6,
      fechaVencimiento: null,
      tasa: { tipo: 'fija', tnaPct: 0 },
      baseDias: null,
      medioIngresoPrevisto: 'transferencia',
      mediosDevolucion: ['transferencia_usd'],
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
    aprobacion: null,
    operacionPendiente: null,
    renovacionDe: null,
    renovadaEn: null,
    versionCronograma: 1,
    indiceAlta: null,
    observaciones: null,
    importada: false,
  }
}

const aprobar = (inv: InversionDocumentBase) => ({ data: { ...inv, estado: 'vigente' as const }, historial: null })

describe('aprobar una inversión escribe la Agenda en la misma transacción', () => {
  it('crea las 6 cuotas con id fijo, grupo y origen, y el cobro esperado del capital', async () => {
    base.clear()
    base.set('inversiones/x', pendiente() as never)
    const avisos = await transicionConAgenda('x', 'u1', aprobar)
    expect(avisos).toEqual([])
    const c1 = base.get('compromisosPago/inv-x-c1')!
    expect(c1).toMatchObject({
      montoCentavos: 200_000,
      moneda: 'USD',
      grupo: 'Inversores USD',
      origen: 'inversiones',
      estado: 'pendiente',
      cuotaNumero: 1,
      cuotaTotal: 6,
      proveedorONombre: 'Perez Ana',
    })
    expect([...base.keys()].filter((k) => /^compromisosPago\/inv-x-c\d+$/.test(k))).toHaveLength(6)
    expect(base.get('cobrosEsperados/inv-x-ingreso')).toMatchObject({ estado: 'esperado', montoCentavos: 1_200_000, origen: 'inversiones' })
    expect(base.get('inversiones/x')).toMatchObject({ estado: 'vigente' })
  })

  it('repetir no duplica ni reescribe (misma versión del cronograma)', async () => {
    escrituras.length = 0
    await transicionConAgenda('x', 'u1', (inv) => ({ data: inv, historial: null }))
    expect(escrituras.filter((p) => /^compromisosPago\/inv-x-c\d+$/.test(p))).toHaveLength(0)
  })

  it('si la validación falla no se escribe nada', async () => {
    escrituras.length = 0
    await expect(
      transicionConAgenda('x', 'u1', () => {
        throw new Error('No se puede')
      }),
    ).rejects.toThrow('No se puede')
    expect(escrituras).toHaveLength(0)
  })
})
