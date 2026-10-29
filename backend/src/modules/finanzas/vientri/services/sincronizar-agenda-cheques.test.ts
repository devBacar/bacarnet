import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import type { VientriChequeDoc } from '../domain/tipos.js'

const store = new Map<string, Record<string, unknown>>()
const escrituras: Array<{ op: string; id: string }> = []

vi.mock('../../../../lib/firebase/admin.js', () => ({
  adminDb: () => ({
    collection: (nombre: string) => ({
      where: (campo: string, _op: string, valor: unknown) => ({
        get: async () => {
          const docs = [...store.entries()]
            .filter(([path, data]) => path.startsWith(`${nombre}/`) && data[campo] === valor)
            .map(([path, data]) => ({
              id: path.slice(nombre.length + 1),
              data: () => data,
              get: (k: string) => data[k],
            }))
          return { docs }
        },
      }),
      doc: (id: string) => {
        const path = `${nombre}/${id}`
        return {
          id,
          path,
          collection: (sub: string) => ({
            doc: (subId?: string) => ({
              id: subId ?? 'auto',
              path: `${path}/${sub}/${subId ?? Math.random().toString(36).slice(2)}`,
            }),
          }),
          get: async () => {
            const data = store.get(path)
            return {
              exists: data !== undefined,
              id,
              data: () => data,
              get: (k: string) => data?.[k],
            }
          },
        }
      },
      get: async () => ({
        docs: [...store.entries()]
          .filter(([path]) => path.startsWith(`${nombre}/`))
          .map(([path, data]) => ({
            id: path.slice(nombre.length + 1),
            data: () => data,
            get: (k: string) => data[k],
          })),
      }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: { path: string }) => {
          const data = store.get(ref.path)
          return { exists: data !== undefined, data: () => data, id: ref.path.split('/').at(-1) }
        },
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          escrituras.push({ op: 'set', id: ref.path })
          store.set(ref.path, { ...data })
        },
        update: (ref: { path: string }, data: Record<string, unknown>) => {
          escrituras.push({ op: 'update', id: ref.path })
          store.set(ref.path, { ...store.get(ref.path), ...data })
        },
      }),
  }),
}))

vi.mock('../../agenda/domain/agenda.historial.js', () => ({
  buildAgendaHistorialEntry: (x: unknown) => x,
}))

import { sincronizarAgendaCheques } from './sincronizar-agenda-cheques.js'
import { reprogramarCompromiso } from '../../agenda/services/compromisos.service.js'

function cheque(p: Partial<VientriChequeDoc>): VientriChequeDoc {
  return {
    clave: 'ch-99',
    direccion: 'emitido',
    tipo: 'fisico',
    numero: '999',
    serie: '',
    bancoId: 2,
    bancoNombre: 'Banco Demo',
    montoCentavos: 80_000_00,
    fechaEmision: '2026-09-10',
    fechaVencimiento: '2026-10-20',
    fechaRecibido: null,
    fechaDeposito: null,
    fechaEntregado: null,
    fechaConciliado: null,
    estado: 'pendiente_debito',
    estadoVientri: 'Pendiente de débito',
    estadoVientriId: 2,
    librador: null,
    entregadoPor: null,
    entregadoA: null,
    destinatario: 'Destinatario Ficticio',
    idCmpIngreso: null,
    cmpIngresoDesc: null,
    idCmpSalida: null,
    cmpSalidaDesc: null,
    idCmpNdRechazo: null,
    idCmpPagoBanco: null,
    estadoPrevioId: null,
    motivoRechazoId: null,
    fuentes: ['CHQOCA'],
    vientriChqId: null,
    vientriChqocaId: 99,
    baja: false,
    revisar: [],
    fecsys: null,
    ...p,
  }
}

beforeEach(() => {
  store.clear()
  escrituras.length = 0
})

describe('sincronizarAgendaCheques', () => {
  it('da de alta un compromiso desde un cheque pendiente', async () => {
    const c = cheque({})
    const conteo = await sincronizarAgendaCheques({
      chequesEnVentana: [c],
      todosLosCheques: [c],
      fechaDatos: '2026-10-19',
      escribir: true,
    })
    expect(conteo.crear).toBe(1)
    const doc = store.get('compromisosPago/vientri-cheque-ch-99')
    expect(doc).toMatchObject({
      origen: 'vientri-cheque',
      medioPago: 'cheque',
      montoCentavos: 80_000_00,
      estado: 'pendiente',
      grupo: 'Bancos',
      proveedorONombre: 'Destinatario Ficticio',
      createdBy: 'vientri',
    })
    expect(doc?.vientriCheque).toMatchObject({ clave: 'ch-99', estado: 'pendiente_debito' })
  })

  it('no duplica si se corre dos veces seguidas', async () => {
    const c = cheque({})
    const opts = {
      chequesEnVentana: [c],
      todosLosCheques: [c],
      fechaDatos: '2026-10-19',
      escribir: true as const,
    }
    await sincronizarAgendaCheques(opts)
    escrituras.length = 0
    const segunda = await sincronizarAgendaCheques(opts)
    expect(segunda.crear).toBe(0)
    expect(segunda.actualizar).toBe(0)
    expect(escrituras.filter((e) => e.op === 'set' && e.id === 'compromisosPago/vientri-cheque-ch-99')).toHaveLength(0)
  })

  it('pasa a pagado cuando el cheque se debita', async () => {
    const pendiente = cheque({})
    await sincronizarAgendaCheques({
      chequesEnVentana: [pendiente],
      todosLosCheques: [pendiente],
      fechaDatos: '2026-10-19',
      escribir: true,
    })
    const debitado = cheque({ estado: 'debitado' })
    const conteo = await sincronizarAgendaCheques({
      chequesEnVentana: [debitado],
      todosLosCheques: [debitado],
      fechaDatos: '2026-10-21',
      escribir: true,
    })
    expect(conteo.cerrarPagado).toBe(1)
    expect(store.get('compromisosPago/vientri-cheque-ch-99')).toMatchObject({
      estado: 'pagado',
      pagadoPor: 'vientri',
    })
  })
})

describe('reprogramarCompromiso con origen vientri-cheque', () => {
  it('cambia la fecha en Bacarnet y no escribe nada hacia colecciones Vientri', async () => {
    store.set('compromisosPago/vientri-cheque-ch-99', {
      concepto: 'Cheque 999 · Banco Demo',
      proveedorONombre: 'Destinatario Ficticio',
      montoCentavos: 80_000_00,
      fechaVencimiento: Timestamp.fromDate(new Date('2026-10-20T12:00:00-03:00')),
      prioridad: 0,
      urgenciaManual: null,
      medioPago: 'cheque',
      chequeId: null,
      transferenciaConfeccionadaId: null,
      estado: 'pendiente',
      cuentaId: null,
      fechaPago: null,
      pagadoPor: null,
      esViatico: false,
      beneficiarioEmpleado: null,
      grupo: 'Bancos',
      moneda: 'ARS',
      pagos: [],
      origen: 'vientri-cheque',
      vientriCheque: {
        clave: 'ch-99',
        estado: 'pendiente_debito',
        numero: '999',
        bancoNombre: 'Banco Demo',
        fechaVencimiento: '2026-10-20',
        fechaDatos: '2026-10-19',
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: 'vientri',
    })

    const pathsAntes = [...store.keys()]
    const result = await reprogramarCompromiso('vientri-cheque-ch-99', 'usuario-test', '2026-11-05')
    expect(result.fechaVencimiento?.slice(0, 10)).toBe('2026-11-05')

    const pathsVientri = [...store.keys()].filter(
      (p) => p.startsWith('vientriCheques/') || p.startsWith('vientriPendientes/') || p.startsWith('vientriEstado/'),
    )
    expect(pathsVientri).toEqual([])
    // Solo se tocó el compromiso (y su historial), no aparecieron docs Vientri nuevos.
    expect([...store.keys()].filter((p) => !pathsAntes.includes(p) && p.startsWith('vientri'))).toEqual([])
  })
})
