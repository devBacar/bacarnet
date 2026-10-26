import * as XLSX from 'xlsx'
import { describe, expect, it, vi } from 'vitest'
import { CONFIG_INVERSIONES_DEFAULT } from '../domain/inversion.types.js'
import { confirmar, vistaPrevia } from './importar-planilla.service.js'

/** Firestore en memoria: lo justo para la importación. Datos inventados. */
const base = new Map<string, Record<string, unknown>>()
const inversores: Array<{ id: string; data: { nombreNormalizado: string } }> = []
let cola: Promise<unknown> = Promise.resolve()

function ref(path: string): Record<string, unknown> {
  return {
    id: path.split('/').at(-1),
    path,
    get: async () => ({ exists: base.has(path), data: () => base.get(path) }),
    set: async (d: Record<string, unknown>) => void base.set(path, d),
    collection: (c: string) => ({ doc: () => ref(`${path}/${c}/${Math.random().toString(36).slice(2)}`) }),
  }
}

vi.mock('../../../../lib/firebase/admin.js', () => ({
  adminDb: () => ({
    collection: (c: string) => ({
      doc: (id: string) => ref(`${c}/${id}`),
      where: () => ({
        get: async () => ({
          docs: [...base.keys()]
            .filter((k) => k.split('/').length === 2 && k.startsWith(`${c}/`))
            .map((k) => ({ id: k.split('/')[1], data: () => base.get(k) })),
        }),
      }),
    }),
    runTransaction: (fn: (tx: unknown) => Promise<unknown>) => {
      const turno = cola.then(() =>
        fn({
          get: async (r: { path: string }) => ({ exists: base.has(r.path), data: () => base.get(r.path) }),
          update: (r: { path: string }, d: Record<string, unknown>) => void base.set(r.path, { ...base.get(r.path), ...d }),
        }),
      )
      cola = turno.catch(() => undefined)
      return turno
    },
    batch: () => {
      const ops: Array<() => void> = []
      return {
        create: (r: { path: string }, d: Record<string, unknown>) =>
          ops.push(() => {
            if (base.has(r.path)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 })
            base.set(r.path, d)
          }),
        set: (r: { path: string }, d: Record<string, unknown>) => ops.push(() => void base.set(r.path, d)),
        commit: async () => ops.forEach((op) => op()),
      }
    },
  }),
}))

let numero = 0
vi.mock('./inversores.repository.js', async (original) => ({
  ...(await original<typeof import('./inversores.repository.js')>()),
  getConfigInversiones: async () => CONFIG_INVERSIONES_DEFAULT,
  listInversoresDocs: async () => inversores,
  crearInversorDoc: async (datos: { nombre: string }, _uid: string, idFijo?: string) => {
    const id = idFijo ?? `inv${inversores.length + 1}`
    if (!inversores.some((i) => i.id === id)) inversores.push({ id, data: { nombreNormalizado: datos.nombre.toLowerCase() } })
    return id
  },
  siguienteNumeroInversion: async () => ++numero,
}))

function planilla(): Buffer {
  const hoja = (mes: string, filas: unknown[][]) =>
    XLSX.utils.aoa_to_sheet([
      ['COMPROMISOS', null, null, null, null, 1500],
      ['CONCEPTO', 'DEUDA', 'IMPORTE A PAGAR', 'CUOTA', 'OBSERVACION', `05/${mes}`, 'Acumulado'],
      ['INVERSORES DOLARES'],
      ...filas,
      ['SUBTOTALES INVERSORES USD'],
      ['INVERSORES PESOS'],
      ['SUBTOTALES INVERSORES PESOS'],
    ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, hoja('09/2026', [['Gomez Ana', 1000, 100, '9 de 20', 'Acuerdo', 100], ['Sin Datos', 50, 0, '-', '-']]), 'Compromisos 09.2026')
  XLSX.utils.book_append_sheet(wb, hoja('10/2026', [['Gomez Ana', 900, 100, '10 de 20', 'Acuerdo', 100], ['Sin Datos', 50, 0, '-', '-']]), 'Compromisos 10.2026')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

const user = { uid: 'u1', displayName: 'Líder', permissions: {} } as never

describe('importar la planilla', () => {
  it('vista previa: historial de 2 meses, la fila sin datos marcada y nada creado todavía', async () => {
    const vp = await vistaPrevia(planilla(), null, user)
    expect(vp.hoja).toBe('Compromisos 10.2026')
    const gomez = vp.filas.find((f) => f.inversorNombre === 'Gomez Ana')!
    expect(gomez).toMatchObject({ ok: true, mesesEncontrados: 2, desdeMes: '2026-09', cantidadCuotas: 10, yaImportada: false })
    expect(vp.filas.find((f) => f.inversorNombre === 'Sin Datos')!.ok).toBe(false)
    expect([...base.keys()].some((k) => k.startsWith('inversiones/'))).toBe(false)
  })

  it('confirmar crea "Para aprobar"; confirmar de nuevo no duplica inversores ni inversiones', async () => {
    const vp = await vistaPrevia(planilla(), null, user)
    const filas = vp.filas.map((f) => f.fila)
    const primera = await confirmar(vp.token, filas, user)
    expect(primera).toMatchObject({ creadas: 1, inversoresNuevos: 2 })
    const inv = [...base.entries()].find(([k]) => /^inversiones\/[^/]+$/.test(k))![1]
    expect(inv).toMatchObject({ estado: 'pendiente_aprobacion', importada: true, inicioPlanilla: '2026-09' })
    expect((inv.ingresos as Array<{ importado: boolean }>)[0].importado).toBe(true)

    const otra = await vistaPrevia(planilla(), null, user)
    expect(otra.filas.find((f) => f.inversorNombre === 'Gomez Ana')!.yaImportada).toBe(true)
    const segunda = await confirmar(otra.token, filas, user)
    expect(segunda).toMatchObject({ creadas: 0, inversoresNuevos: 0 })
    expect([...base.keys()].filter((k) => /^inversiones\/[^/]+$/.test(k))).toHaveLength(1)
    expect(inversores).toHaveLength(2)
  })

  it('dos confirmar a la vez con la misma vista previa: uno solo importa', async () => {
    base.clear()
    inversores.length = 0
    const vp = await vistaPrevia(planilla(), null, user)
    const filas = vp.filas.map((f) => f.fila)
    const r = await Promise.allSettled([confirmar(vp.token, filas, user), confirmar(vp.token, filas, user)])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(String((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason.message)).toContain('ya se confirmó')
    expect(inversores).toHaveLength(2)
    expect(inversores.every((i) => i.id.startsWith('pla-'))).toBe(true)
  })

  it('la vista previa vence y es de quien la armó', async () => {
    const vp = await vistaPrevia(planilla(), null, user)
    await expect(confirmar(vp.token, [], { uid: 'otro', displayName: 'X', permissions: {} } as never)).rejects.toThrow('otra persona')
    base.set(`inversionesImportaciones/${vp.token}`, { ...base.get(`inversionesImportaciones/${vp.token}`), venceMs: 0 })
    await expect(confirmar(vp.token, [], user)).rejects.toThrow('venció')
  })
})
