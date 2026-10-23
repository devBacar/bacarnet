import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { NextFunction, Request, Response } from 'express'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { detalleInversion, simular } from '../services/inversiones.service.js'
import { finanzasInversionesRouter } from './inversiones.routes.js'

/**
 * Permisos de las rutas de Inversores. El usuario se simula con el header x-permisos
 * (lista separada por comas); los servicios no tocan Firestore.
 */
vi.mock('../../../auth/middleware.js', () => ({
  requireWorkspaceUser: (req: Request, _res: Response, next: NextFunction) => {
    const claves = String(req.headers['x-permisos'] ?? '').split(',').filter(Boolean)
    req.authedUser = {
      uid: 'u1',
      email: 'u1@bacarsa.com.ar',
      displayName: 'Usuario',
      managedAreaIds: [],
      permissions: Object.fromEntries(claves.map((c) => [c, true])),
    } as never
    next()
  },
  requireViewFinanzas: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireFinanzasPermiso: (clave: string) => (req: Request, res: Response, next: NextFunction) => {
    const perms = (req.authedUser as unknown as { permissions: Record<string, boolean> }).permissions
    if (perms[clave] === true) next()
    else res.status(403).json({ error: clave })
  },
}))

vi.mock('../services/inversores.service.js', () => ({
  listarInversores: vi.fn(async () => []),
  crearInversor: vi.fn(async () => ({})),
  fichaInversor: vi.fn(async () => ({})),
  editarInversor: vi.fn(async () => ({})),
  cambiarEstadoInversor: vi.fn(async () => ({})),
  leerConfig: vi.fn(async () => ({})),
  guardarConfig: vi.fn(async () => ({})),
}))

vi.mock('../services/inversiones.service.js', () => ({
  listarInversiones: vi.fn(async () => ({ inversiones: [], kpis: {} })),
  detalleInversion: vi.fn(async () => ({ id: 'x' })),
  simular: vi.fn(async () => ({ cronograma: [] })),
  crearInversion: vi.fn(async () => ({})),
  editarInversion: vi.fn(async () => ({})),
  enviarAAprobacion: vi.fn(async () => ({})),
  aprobarInversion: vi.fn(async () => ({ estado: 'vigente' })),
  rechazarInversion: vi.fn(async () => ({})),
  anularInversion: vi.fn(async () => ({})),
}))


let server: Server
let base = ''

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/inv', finanzasInversionesRouter)
  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/inv`
})

afterAll(() => new Promise<void>((r) => server.close(() => r())))

function pedir(metodo: string, ruta: string, permisos: string[]) {
  return fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-permisos': permisos.join(',') },
    body: metodo === 'GET' ? undefined : '{}',
  })
}

const OPERADOR = ['finanzas_inversiones']
const LIDER = ['finanzas_inversiones', 'finanzas_inversiones_aprobar']

describe('rutas de Inversores: permisos', () => {
  it('sin finanzas_inversiones no entra a nada', async () => {
    for (const [m, r] of [['GET', '/'], ['GET', '/inversores'], ['GET', '/config'], ['POST', '/simular']]) {
      expect((await pedir(m, r, [])).status, `${m} ${r}`).toBe(403)
    }
  })

  it('el operador lista, simula y crea, pero no aprueba, rechaza ni cambia la configuración', async () => {
    expect((await pedir('GET', '/', OPERADOR)).status).toBe(200)
    expect((await pedir('POST', '/simular', OPERADOR)).status).toBe(200)
    expect((await pedir('POST', '/', OPERADOR)).status).toBe(201)
    expect((await pedir('POST', '/abc/aprobar', OPERADOR)).status).toBe(403)
    expect((await pedir('POST', '/abc/rechazar', OPERADOR)).status).toBe(403)
    expect((await pedir('PUT', '/config', OPERADOR)).status).toBe(403)
  })

  it('el Líder aprueba y guarda la configuración', async () => {
    expect((await pedir('POST', '/abc/aprobar', LIDER)).status).toBe(200)
    expect((await pedir('PUT', '/config', LIDER)).status).toBe(200)
  })

  it('las rutas fijas no las pisa /:id', async () => {
    vi.mocked(detalleInversion).mockClear()
    await pedir('POST', '/simular', OPERADOR)
    await pedir('GET', '/inversores', OPERADOR)
    await pedir('GET', '/config', OPERADOR)
    expect(simular).toHaveBeenCalled()
    expect(detalleInversion).not.toHaveBeenCalled()
  })
})
