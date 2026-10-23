import { describe, expect, it, vi } from 'vitest'
import { ErrorValidacion } from '../domain/validar.js'
import { anularInversion, aprobarInversion } from './inversiones.service.js'

/**
 * Carrera: la inversión cambió entre que se pidió la acción y se escribe.
 * La transacción vuelve a leer y valida con el estado nuevo: no se pisa nada.
 */
const escrito: unknown[] = []
let estadoEnBase = 'vigente'

const ref = {
  collection: () => ({ doc: () => ({ id: 'h1' }) }),
}

vi.mock('../../../../lib/firebase/admin.js', () => ({
  adminDb: () => ({
    collection: () => ({ doc: () => ref }),
    runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        get: async () => ({ exists: true, data: () => ({ estado: estadoEnBase, versionCronograma: 1 }) }),
        set: (_r: unknown, data: unknown) => escrito.push(data),
      }),
  }),
}))


const lider = { uid: 'u1', displayName: 'Líder', permissions: { finanzas_inversiones_aprobar: true } } as never

describe('cambios de estado dentro de una transacción', () => {
  it('anular una inversión que otro ya aprobó → error claro y no se escribe nada', async () => {
    estadoEnBase = 'vigente'
    escrito.length = 0
    await expect(anularInversion('x', 'me equivoqué', lider)).rejects.toThrow(ErrorValidacion)
    await expect(anularInversion('x', 'me equivoqué', lider)).rejects.toThrow('Vigente')
    expect(escrito).toHaveLength(0)
  })

  it('doble clic en aprobar: la segunda vez ya está vigente → error y no se escribe', async () => {
    estadoEnBase = 'vigente'
    escrito.length = 0
    await expect(aprobarInversion('x', null, lider)).rejects.toThrow(ErrorValidacion)
    expect(escrito).toHaveLength(0)
  })
})
