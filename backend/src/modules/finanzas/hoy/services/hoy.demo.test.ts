import type { Firestore } from 'firebase-admin/firestore'
import { describe, expect, it, vi } from 'vitest'
import { SoloEnPruebasError } from '../domain/hoy.demo.js'
import { borrarDatosDemo, hayDatosDemo } from './hoy.demo.js'

vi.mock('../../../../lib/firebase/admin.js', () => ({
  adminDb: () => {
    throw new Error('El test no debe usar la base real')
  },
}))

interface DocFalso {
  coleccion: string
  id: string
  demo?: boolean
}

/** Firestore de juguete: solo `collection().where('demo','==',true)[.limit()].get()` y `batch()`. */
function firestoreFalso(docs: DocFalso[]) {
  const borrados: string[] = []
  const consultas: string[] = []
  const db = {
    collection(nombre: string) {
      const filtro = (limite: number | null) => ({
        limit: (n: number) => filtro(n),
        async get() {
          consultas.push(nombre)
          const encontrados = docs
            .filter((doc) => doc.coleccion === nombre && doc.demo === true)
            .slice(0, limite ?? undefined)
            .map((doc) => ({ ref: `${doc.coleccion}/${doc.id}` }))
          return { empty: encontrados.length === 0, docs: encontrados }
        },
      })
      return {
        where(campo: string, op: string, valor: unknown) {
          expect(campo).toBe('demo')
          expect(op).toBe('==')
          expect(valor).toBe(true)
          return filtro(null)
        },
      }
    },
    batch() {
      const pendientes: string[] = []
      return {
        delete(ref: string) {
          pendientes.push(ref)
        },
        async commit() {
          borrados.push(...pendientes)
        },
      }
    },
  }
  return { db: db as unknown as Firestore, borrados, consultas }
}

const DOCS: DocFalso[] = [
  { coleccion: 'compromisosPago', id: 'c1', demo: true },
  { coleccion: 'compromisosPago', id: 'c2' },
  { coleccion: 'cobrosEsperados', id: 'k1', demo: true },
  { coleccion: 'cobrosEsperados', id: 'k2', demo: true },
  { coleccion: 'cheques', id: 'q1' },
]

describe('hoy: borrar datos de ejemplo', () => {
  it('sin emulador se niega con 403 y no toca la base', async () => {
    const falso = firestoreFalso(DOCS)
    await expect(borrarDatosDemo({ env: {}, db: falso.db })).rejects.toBeInstanceOf(SoloEnPruebasError)
    await expect(borrarDatosDemo({ env: { FUNCTIONS_EMULATOR: 'false' }, db: falso.db })).rejects.toMatchObject({
      status: 403,
      message: 'Solo en el entorno de pruebas',
    })
    expect(falso.consultas).toEqual([])
    expect(falso.borrados).toEqual([])
  })

  it('con emulador borra solo los docs demo de las tres colecciones', async () => {
    const falso = firestoreFalso(DOCS)
    const resultado = await borrarDatosDemo({ env: { FUNCTIONS_EMULATOR: 'true' }, db: falso.db })
    expect(resultado).toEqual({
      borrados: { compromisosPago: 1, cobrosEsperados: 2, cheques: 0 },
      total: 3,
    })
    expect(falso.borrados.sort()).toEqual(['cobrosEsperados/k1', 'cobrosEsperados/k2', 'compromisosPago/c1'])
  })

  it('alcanza con apuntar al emulador de Firestore', async () => {
    const falso = firestoreFalso(DOCS)
    const resultado = await borrarDatosDemo({ env: { FIRESTORE_EMULATOR_HOST: 'localhost:8080' }, db: falso.db })
    expect(resultado.total).toBe(3)
  })
})

describe('hoy: hayDatosDemo', () => {
  it('es true si queda algún doc demo y false si no', async () => {
    expect(await hayDatosDemo(firestoreFalso(DOCS).db)).toBe(true)
    expect(await hayDatosDemo(firestoreFalso([{ coleccion: 'cheques', id: 'q1' }]).db)).toBe(false)
    expect(await hayDatosDemo(firestoreFalso([{ coleccion: 'cheques', id: 'q2', demo: true }]).db)).toBe(true)
  })
})
