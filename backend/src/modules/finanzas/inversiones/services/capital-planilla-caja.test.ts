import * as XLSX from 'xlsx'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validarCondiciones } from '../domain/condiciones.js'
import { generarCronograma } from '../domain/cronograma.js'
import { CONFIG_INVERSIONES_DEFAULT, type InversionDocumentBase } from '../domain/inversion.types.js'

/**
 * Capital de planilla → Caja principal:
 * - inversión realmente nueva (un solo mes, inversor sin importadas) suma al saldo
 * - cuota siguiente de cadena ya importada no mueve la caja
 */

const base = new Map<string, Record<string, unknown>>()
const inversores: Array<{ id: string; data: { nombreNormalizado: string } }> = []
let cola: Promise<unknown> = Promise.resolve()
let numero = 0

/** Saldo en memoria de cada caja (centavos). */
const saldosCaja = new Map<string, number>()
const movimientosCaja: Array<{ cajaId: string; montoCentavos: number; concepto: string }> = []

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
      get: async () => ({
        docs: [...base.keys()]
          .filter((k) => k.split('/').length === 2 && k.startsWith(`${c}/`))
          .map((k) => ({ id: k.split('/')[1], data: () => base.get(k) })),
      }),
    }),
    runTransaction: (fn: (tx: unknown) => Promise<unknown>) => {
      const turno = cola.then(() =>
        fn({
          get: async (r: { path: string }) => ({ exists: base.has(r.path), data: () => base.get(r.path) }),
          update: (r: { path: string }, d: Record<string, unknown>) => void base.set(r.path, { ...base.get(r.path), ...d }),
          set: (r: { path: string }, d: Record<string, unknown>) => void base.set(r.path, d),
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

vi.mock('./inversores.repository.js', async (original) => ({
  ...(await original<typeof import('./inversores.repository.js')>()),
  getConfigInversiones: async () => CONFIG_INVERSIONES_DEFAULT,
  listInversoresDocs: async () => inversores,
  getInversorDoc: async (id: string) => {
    const row = inversores.find((i) => i.id === id)
    return row
      ? { nombre: row.data.nombreNormalizado, estado: 'activo', inscriptoGanancias: null }
      : null
  },
  crearInversorDoc: async (datos: { nombre: string }, _uid: string, idFijo?: string) => {
    const id = idFijo ?? `inv${inversores.length + 1}`
    if (!inversores.some((i) => i.id === id)) {
      inversores.push({ id, data: { nombreNormalizado: datos.nombre.toLowerCase() } })
    }
    return id
  },
  siguienteNumeroInversion: async () => ++numero,
}))

vi.mock('./agenda-inversiones.js', () => ({
  transicionConAgenda: vi.fn(
    async (id: string, _uid: string, fn: (inv: InversionDocumentBase) => { data: InversionDocumentBase; historial: unknown }) => {
      const path = `inversiones/${id}`
      const actual = base.get(path) as unknown as InversionDocumentBase
      const r = fn(actual)
      base.set(path, r.data as unknown as Record<string, unknown>)
      return []
    },
  ),
}))

vi.mock('./inversiones.repository.js', async (original) => ({
  ...(await original<typeof import('./inversiones.repository.js')>()),
  getInversionDoc: async (id: string) => (base.get(`inversiones/${id}`) as InversionDocumentBase | undefined) ?? null,
  listHistorial: vi.fn(async () => []),
  compromisosDeCuotas: vi.fn(async () => new Map()),
  reservarIngresoCaja: vi.fn(async () => ({ tipo: 'nueva' as const })),
  cerrarReservaCaja: vi.fn(async () => undefined),
  movimientoCajaPorClave: vi.fn(async () => null),
  reservasCajaHechas: vi.fn(async () => []),
  movimientoCajaDatos: vi.fn(async () => null),
}))

vi.mock('../../cajachica/services/caja.repository.js', () => ({
  listCajasDocs: async () =>
    [...base.keys()]
      .filter((k) => k.startsWith('cajas/') && k.split('/').length === 2)
      .map((k) => ({ id: k.split('/')[1], data: base.get(k) })),
  getCajaDoc: async (id: string) => base.get(`cajas/${id}`) ?? null,
  createCajaDoc: async (input: {
    id: string
    nombre: string
    tipo: string
    moneda: string
    responsableUid: string
    createdBy: string
  }) => {
    base.set(`cajas/${input.id}`, {
      nombre: input.nombre,
      tipo: input.tipo,
      moneda: input.moneda,
      cajaPadreId: null,
      responsableUid: input.responsableUid,
      saldoActualCentavos: 0,
      estado: 'activa',
      createdBy: input.createdBy,
    })
    saldosCaja.set(input.id, 0)
  },
}))

vi.mock('../../cajachica/services/caja.service.js', () => ({
  registerMovimiento: async (input: {
    cajaId: string
    body: { montoCentavos: number; concepto: string }
  }) => {
    const movId = `mov-${movimientosCaja.length + 1}`
    const monto = input.body.montoCentavos
    const prev = saldosCaja.get(input.cajaId) ?? 0
    saldosCaja.set(input.cajaId, prev + monto)
    const caja = base.get(`cajas/${input.cajaId}`)
    if (caja) base.set(`cajas/${input.cajaId}`, { ...caja, saldoActualCentavos: prev + monto })
    movimientosCaja.push({ cajaId: input.cajaId, montoCentavos: monto, concepto: input.body.concepto })
    return { id: movId }
  },
}))

import { confirmar, vistaPrevia } from './importar-planilla.service.js'
import { aprobarConCapitalEnCaja } from './sincronizar-planilla.service.js'

const user = {
  uid: 'u1',
  displayName: 'Líder',
  email: 'lider@test.com',
  permissions: { finanzas_inversiones_aprobar: true, manage_finanzas_caja: true },
} as { uid: string; displayName: string; email: string; permissions: Record<string, boolean> }

/** Una sola hoja: inversión que aparece por primera vez este mes. */
function planillaSoloMesNuevo(): Buffer {
  const hoja = XLSX.utils.aoa_to_sheet([
    ['COMPROMISOS', null, null, null, null, 1500],
    ['CONCEPTO', 'DEUDA', 'IMPORTE A PAGAR', 'CUOTA', 'OBSERVACION', '05/10/2026', 'Acumulado'],
    ['INVERSORES DOLARES'],
    ['Nuevo Inversor', 500, 50, '1 de 10', 'Pagare', 50],
    ['SUBTOTALES INVERSORES USD'],
    ['INVERSORES PESOS'],
    ['SUBTOTALES INVERSORES PESOS'],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, hoja, 'Compromisos 10.2026')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

/** Dos meses de la misma cadena (continuación). */
function planillaCadenaDosMeses(): Buffer {
  const hoja = (mes: string, deuda: number, cuota: string) =>
    XLSX.utils.aoa_to_sheet([
      ['COMPROMISOS', null, null, null, null, 1500],
      ['CONCEPTO', 'DEUDA', 'IMPORTE A PAGAR', 'CUOTA', 'OBSERVACION', `05/${mes}`, 'Acumulado'],
      ['INVERSORES DOLARES'],
      ['Gomez Ana', deuda, 100, cuota, 'Acuerdo', 100],
      ['SUBTOTALES INVERSORES USD'],
      ['INVERSORES PESOS'],
      ['SUBTOTALES INVERSORES PESOS'],
    ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, hoja('09/2026', 1000, '9 de 20'), 'Compromisos 09.2026')
  XLSX.utils.book_append_sheet(wb, hoja('10/2026', 900, '10 de 20'), 'Compromisos 10.2026')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

/** Mes siguiente de la misma cadena (id fijo sigue apuntando al primer mes). */
function planillaCadenaTresMeses(): Buffer {
  const hoja = (mes: string, deuda: number, cuota: string) =>
    XLSX.utils.aoa_to_sheet([
      ['COMPROMISOS', null, null, null, null, 1500],
      ['CONCEPTO', 'DEUDA', 'IMPORTE A PAGAR', 'CUOTA', 'OBSERVACION', `05/${mes}`, 'Acumulado'],
      ['INVERSORES DOLARES'],
      ['Gomez Ana', deuda, 100, cuota, 'Acuerdo', 100],
      ['SUBTOTALES INVERSORES USD'],
      ['INVERSORES PESOS'],
      ['SUBTOTALES INVERSORES PESOS'],
    ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, hoja('09/2026', 1000, '9 de 20'), 'Compromisos 09.2026')
  XLSX.utils.book_append_sheet(wb, hoja('10/2026', 900, '10 de 20'), 'Compromisos 10.2026')
  XLSX.utils.book_append_sheet(wb, hoja('11/2026', 800, '11 de 20'), 'Compromisos 11.2026')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

beforeEach(() => {
  base.clear()
  inversores.length = 0
  saldosCaja.clear()
  movimientosCaja.length = 0
  numero = 0
  cola = Promise.resolve()
})

describe('capital de planilla → Caja principal', () => {
  it('inversión nueva (inversorId que no existía) → el saldo de la Caja principal sube en el capital', async () => {
    const vp = await vistaPrevia(planillaSoloMesNuevo(), null, user as never)
    const fila = vp.filas.find((f) => f.inversorNombre === 'Nuevo Inversor')!
    expect(fila).toMatchObject({ ok: true, capitalSumaACaja: true, mesesEncontrados: 1, yaImportada: false })

    const conf = await confirmar(vp.token, [fila.fila], user as never)
    expect(conf).toMatchObject({ creadas: 1, capitalNuevoIds: [conf.creadasIds[0]] })

    const invPath = [...base.keys()].find((k) => /^inversiones\/[^/]+$/.test(k))!
    const inv = base.get(invPath)!
    expect(inv.ingresos).toEqual([])
    expect(inv.capitalCentavos).toBe(50_000)
    expect(inv.moneda).toBe('USD')

    // Caja principal USD ya existente (como en producción).
    base.set('cajas/caja-usd', {
      nombre: 'Caja principal',
      tipo: 'principal',
      moneda: 'USD',
      cajaPadreId: null,
      responsableUid: user.uid,
      saldoActualCentavos: 1_000_000,
      estado: 'activa',
    })
    saldosCaja.set('caja-usd', 1_000_000)

    await aprobarConCapitalEnCaja(conf.creadasIds[0], user as never)

    expect(saldosCaja.get('caja-usd')).toBe(1_050_000)
    expect(movimientosCaja).toHaveLength(1)
    expect(movimientosCaja[0]).toMatchObject({ cajaId: 'caja-usd', montoCentavos: 50_000 })
    const vigente = base.get(invPath) as unknown as InversionDocumentBase
    expect(vigente.estado).toBe('vigente')
    expect(vigente.ingresos).toHaveLength(1)
    expect(vigente.ingresos[0].cajaId).toBe('caja-usd')
    expect(vigente.ingresos[0].importado).toBeUndefined()
  })

  it('cuota siguiente de una cadena ya importada → no genera movimiento de caja nuevo', async () => {
    // Primera carga: cadena de 2 meses → capital histórico (dato plano, no suma a caja).
    const vp1 = await vistaPrevia(planillaCadenaDosMeses(), null, user as never)
    const gomez1 = vp1.filas.find((f) => f.inversorNombre === 'Gomez Ana')!
    expect(gomez1).toMatchObject({ capitalSumaACaja: false, mesesEncontrados: 2 })

    const conf1 = await confirmar(vp1.token, [gomez1.fila], user as never)
    expect(conf1.creadas).toBe(1)
    expect(conf1.capitalNuevoIds).toEqual([])
    const inv = base.get(`inversiones/${conf1.creadasIds[0]}`)!
    expect((inv.ingresos as unknown[]).length).toBe(1)
    expect((inv.ingresos as Array<{ importado?: boolean }>)[0].importado).toBe(true)

    base.set('cajas/caja-usd', {
      nombre: 'Caja principal',
      tipo: 'principal',
      moneda: 'USD',
      cajaPadreId: null,
      responsableUid: user.uid,
      saldoActualCentavos: 500_000,
      estado: 'activa',
    })
    saldosCaja.set('caja-usd', 500_000)

    // Mes siguiente: misma cadena (id fijo) → no se vuelve a crear ni se mueve la caja.
    const vp2 = await vistaPrevia(planillaCadenaTresMeses(), null, user as never)
    const gomez2 = vp2.filas.find((f) => f.inversorNombre === 'Gomez Ana')!
    expect(gomez2).toMatchObject({ yaImportada: true, incluir: false })

    const conf2 = await confirmar(vp2.token, [gomez2.fila], user as never)
    expect(conf2).toMatchObject({ creadas: 0, capitalNuevoIds: [] })
    expect(movimientosCaja).toHaveLength(0)
    expect(saldosCaja.get('caja-usd')).toBe(500_000)
  })
})

describe('aprobarConCapitalEnCaja crea la Caja principal si falta', () => {
  it('sin caja USD previa → la crea y suma el capital', async () => {
    const cond = validarCondiciones(
      {
        moneda: 'USD',
        capitalCentavos: 25_000,
        fechaAlta: '2026-10-05',
        sistema: 'frances',
        periodicidad: 'mensual',
        cantidadCuotas: 5,
        fechaVencimiento: null,
        tasa: { tipo: 'fija', tnaPct: 0 },
        baseDias: null,
        medioIngresoPrevisto: 'efectivo',
        mediosDevolucion: ['transferencia_usd'],
        penalidadPrecancelacion: null,
      },
      CONFIG_INVERSIONES_DEFAULT,
    )
    base.set('inversiones/pla-nueva', {
      ...cond,
      numero: 'INV-0001',
      inversorId: 'inv-nuevo',
      inversorNombre: 'Nuevo',
      estado: 'pendiente_aprobacion',
      cronograma: generarCronograma(cond),
      ingresos: [],
      aprobacion: {
        solicitadaPor: 'u1',
        solicitadaPorNombre: 'Líder',
        solicitadaAt: '2026-10-01T12:00:00.000Z',
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
      importada: true,
    })

    await aprobarConCapitalEnCaja('pla-nueva', user as never)

    const cajas = [...base.keys()].filter((k) => k.startsWith('cajas/'))
    expect(cajas).toHaveLength(1)
    const cajaId = cajas[0].split('/')[1]
    expect(saldosCaja.get(cajaId)).toBe(25_000)
    expect(movimientosCaja).toHaveLength(1)
  })
})
