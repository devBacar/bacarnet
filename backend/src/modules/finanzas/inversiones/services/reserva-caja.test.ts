import { describe, expect, it, vi } from 'vitest'
import { cerrarReservaCaja, reservarIngresoCaja } from './inversiones.repository.js'

/**
 * Firestore en memoria con transacciones serializadas (como las ve cada documento en Firestore):
 * alcanza para probar que dos pedidos con la misma clave no pueden ir los dos a la caja.
 */
const base = new Map<string, Record<string, unknown>>()
let cola: Promise<unknown> = Promise.resolve()

function ref(path: string): unknown {
  return {
    path,
    collection: (c: string) => ({ doc: (id: string) => ref(`${path}/${c}/${id}`) }),
    set: async (d: Record<string, unknown>) => void base.set(path, d),
  }
}

vi.mock('../../../../lib/firebase/admin.js', () => ({
  adminDb: () => ({
    collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }),
    runTransaction: (fn: (tx: unknown) => Promise<unknown>) => {
      const turno = cola.then(() =>
        fn({
          get: async (r: { path: string }) => {
            await new Promise((res) => setTimeout(res, 5))
            return { exists: base.has(r.path), data: () => base.get(r.path) }
          },
          set: (r: { path: string }, d: Record<string, unknown>) => base.set(r.path, d),
        }),
      )
      cola = turno.catch(() => undefined)
      return turno
    },
  }),
}))

describe('reserva del ingreso en efectivo', () => {
  it('dos pedidos a la vez con la misma clave: solo uno puede ir a la caja', async () => {
    base.clear()
    const resultados = await Promise.allSettled([reservarIngresoCaja('x', 'clave-0001'), reservarIngresoCaja('x', 'clave-0001')])
    const nuevas = resultados.filter((r) => r.status === 'fulfilled' && r.value.tipo === 'nueva')
    const rechazados = resultados.filter((r) => r.status === 'rejected')
    expect(nuevas).toHaveLength(1)
    expect(rechazados).toHaveLength(1)
    expect(String((rechazados[0] as PromiseRejectedResult).reason.message)).toContain('ya se está registrando')
  })

  it('ya cargada: se reusa el movimiento, no se vuelve a la caja', async () => {
    await cerrarReservaCaja('x', 'clave-0001', 'mov-1')
    expect(await reservarIngresoCaja('x', 'clave-0001')).toEqual({ tipo: 'hecha', cajaMovimientoId: 'mov-1' })
  })

  it('si la caja falló se puede reintentar; una reserva cortada hace más de 2 minutos también', async () => {
    base.clear()
    await reservarIngresoCaja('x', 'clave-0002')
    await cerrarReservaCaja('x', 'clave-0002', null)
    expect(await reservarIngresoCaja('x', 'clave-0002')).toEqual({ tipo: 'nueva' })
    await expect(reservarIngresoCaja('x', 'clave-0002')).rejects.toThrow('ya se está registrando')
    expect(await reservarIngresoCaja('x', 'clave-0002', Date.now() + 3 * 60 * 1000)).toEqual({ tipo: 'nueva' })
  })
})
