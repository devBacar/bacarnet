import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'

/**
 * Fake mínimo de Firestore: solo lo que usan marcarPendienteDeRenovar/listarPendientesDeRenovar/
 * confirmarRenovacionManual (get, update, runTransaction con tx.get/set/update, where, arrayUnion).
 */
const store = new Map<string, Record<string, unknown>>()

function aplicarArrayUnion(prev: unknown, valores: unknown[]): unknown[] {
  const base = Array.isArray(prev) ? prev : []
  const nuevos = valores.filter((v) => !base.includes(v))
  return [...base, ...nuevos]
}

function aplicarPatch(actual: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const resultado = { ...actual }
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && (v as { __arrayUnion?: unknown[] }).__arrayUnion) {
      resultado[k] = aplicarArrayUnion(actual[k], (v as { __arrayUnion: unknown[] }).__arrayUnion)
    } else if (v && typeof v === 'object' && (v as { __serverTimestamp?: boolean }).__serverTimestamp) {
      resultado[k] = Timestamp.now()
    } else {
      resultado[k] = v
    }
  }
  return resultado
}

function docRef(nombre: string, id: string) {
  const path = `${nombre}/${id}`
  return {
    id,
    collection: () => ({ doc: () => ({ id: 'auto' }) }),
    get: async () => {
      const data = store.get(path)
      return { exists: data !== undefined, id, data: () => data }
    },
    update: async (patch: Record<string, unknown>) => {
      const actual = store.get(path)
      if (!actual) throw new Error('no existe')
      store.set(path, aplicarPatch(actual, patch))
    },
  }
}

vi.mock('../../../../lib/firebase/admin.js', () => ({
  adminDb: () => ({
    collection: (nombre: string) => ({
      doc: (id: string) => docRef(nombre, id),
      where: (campo: string, _op: string, valor: unknown) => ({
        get: async () => {
          const docs = [...store.entries()]
            .filter(([path, data]) => path.startsWith(`${nombre}/`) && data[campo] === valor)
            .map(([path, data]) => ({ id: path.slice(nombre.length + 1), data: () => data }))
          return { docs }
        },
      }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        get: async (ref: { id: string }) => {
          const path = `cheques/${ref.id}`
          const data = store.get(path)
          return { exists: data !== undefined, id: ref.id, data: () => data }
        },
        set: (ref: { id: string }, data: Record<string, unknown>) => {
          store.set(`cheques/${ref.id}`, { ...data })
        },
        update: (ref: { id: string }, patch: Record<string, unknown>) => {
          const path = `cheques/${ref.id}`
          const actual = store.get(path)
          if (!actual) throw new Error('no existe')
          store.set(path, aplicarPatch(actual, patch))
        },
      }
      return fn(tx)
    },
  }),
  Timestamp,
}))

vi.mock('firebase-admin/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase-admin/firestore')>('firebase-admin/firestore')
  return {
    ...actual,
    FieldValue: {
      serverTimestamp: () => ({ __serverTimestamp: true }),
      arrayUnion: (...valores: unknown[]) => ({ __arrayUnion: valores }),
    },
  }
})

import {
  marcarPendienteDeRenovar,
  listarPendientesDeRenovar,
  confirmarRenovacionManual,
  ChequeYaRenovadoError,
  ChequeNoEncontradoError,
} from './cheques.repository.js'
import { chequeEmitidoVigente } from '../../hoy/domain/cheques-hoy.js'

function sembrarCheque(id: string, data: Record<string, unknown>) {
  store.set(`cheques/${id}`, {
    numero: id,
    estado: 'en_cartera',
    montoCentavos: 100_000,
    fechaPago: '2026-11-10',
    direccion: 'emitido',
    emisor: 'Bacar',
    destinatario: null,
    ...data,
  })
}

beforeEach(() => {
  store.clear()
})

describe('marcarPendienteDeRenovar', () => {
  it('marca el cheque como pendiente de renovar', async () => {
    sembrarCheque('emitido_111', {})
    await marcarPendienteDeRenovar({ id: 'emitido_111', actorUid: 'uid-1' })
    const data = store.get('cheques/emitido_111')!
    expect(data.pendienteRenovacion).toBe(true)
    expect(data.pendienteRenovacionPorUid).toBe('uid-1')
  })

  it('no deja marcar un cheque que ya está renovado', async () => {
    sembrarCheque('emitido_111', { estado: 'renovado' })
    await expect(marcarPendienteDeRenovar({ id: 'emitido_111', actorUid: 'uid-1' })).rejects.toThrow(ChequeYaRenovadoError)
  })

  it('un cheque inexistente tira error claro', async () => {
    await expect(marcarPendienteDeRenovar({ id: 'no-existe', actorUid: 'uid-1' })).rejects.toThrow(ChequeNoEncontradoError)
  })
})

describe('listarPendientesDeRenovar', () => {
  it('solo trae los pendientes que no se resolvieron (ni a mano ni por Vientri)', async () => {
    sembrarCheque('emitido_1', { numero: '1', pendienteRenovacion: true })
    sembrarCheque('emitido_2', { numero: '2', pendienteRenovacion: true, estado: 'renovado' })
    sembrarCheque('emitido_3', { numero: '3', pendienteRenovacion: true, renovadoManualmente: true })
    sembrarCheque('emitido_4', { numero: '4' })

    const pendientes = await listarPendientesDeRenovar()
    expect(pendientes.map((p) => p.numero)).toEqual(['1'])
  })
})

describe('confirmarRenovacionManual', () => {
  it('renueva varios cheques viejos consolidados en uno nuevo, sin perder la trazabilidad', async () => {
    sembrarCheque('emitido_111', { numero: '111', montoCentavos: 300_000, pendienteRenovacion: true })
    sembrarCheque('emitido_222', { numero: '222', montoCentavos: 200_000, pendienteRenovacion: true })

    const { chequeNuevoId } = await confirmarRenovacionManual({
      chequeViejoIds: ['emitido_111', 'emitido_222'],
      chequeNuevo: { numero: '999', bancoEmisor: 'Galicia', fechaPago: '2026-12-01', montoCentavos: 520_000, destinatario: 'MANA' },
      actorUid: 'uid-1',
    })

    const viejo1 = store.get('cheques/emitido_111')!
    const viejo2 = store.get('cheques/emitido_222')!
    const nuevo = store.get(`cheques/${chequeNuevoId}`)!

    expect(viejo1.estado).toBe('renovado')
    expect(viejo1.renovadoManualmente).toBe(true)
    expect(viejo1.pendienteRenovacion).toBe(false)
    expect(viejo1.renovadoPor).toEqual(['999'])
    expect(viejo2.estado).toBe('renovado')
    expect(nuevo.renovacionDe).toEqual(['111', '222'])
    expect(nuevo.montoCentavos).toBe(520_000)
  })

  it('no deja renovar un cheque dos veces', async () => {
    sembrarCheque('emitido_111', { numero: '111', estado: 'renovado' })
    await expect(
      confirmarRenovacionManual({
        chequeViejoIds: ['emitido_111'],
        chequeNuevo: { numero: '999', bancoEmisor: null, fechaPago: '2026-12-01', montoCentavos: 100_000, destinatario: null },
        actorUid: 'uid-1',
      }),
    ).rejects.toThrow(ChequeYaRenovadoError)
  })

  it('si el sync de Vientri todavía no detectó la renovación y revierte el estado, renovadoManualmente igual lo protege', async () => {
    sembrarCheque('emitido_111', { numero: '111', pendienteRenovacion: true })
    await confirmarRenovacionManual({
      chequeViejoIds: ['emitido_111'],
      chequeNuevo: { numero: '999', bancoEmisor: null, fechaPago: '2026-12-01', montoCentavos: 100_000, destinatario: null },
      actorUid: 'uid-1',
    })
    // El sync diario de Vientri NUNCA toca `renovadoManualmente`: aunque su propio `estado` todavía
    // diga "en_cartera" (porque Vientri no vio la renovación), esto no puede volver a aparecer.
    const actual = store.get('cheques/emitido_111')!
    expect(actual.renovadoManualmente).toBe(true)
    store.set('cheques/emitido_111', { ...actual, estado: 'en_cartera' })
    const pendientes = await listarPendientesDeRenovar()
    expect(pendientes).toHaveLength(0)
    // Y chequeEmitidoVigente (lo que usa Hoy) tampoco lo vuelve a considerar vigente.
    expect(chequeEmitidoVigente(actual as { direccion: string; estado: string; renovadoManualmente?: boolean })).toBe(false)
    expect(
      chequeEmitidoVigente({ ...actual, estado: 'en_cartera' } as { direccion: string; estado: string; renovadoManualmente?: boolean }),
    ).toBe(false)
  })
})
