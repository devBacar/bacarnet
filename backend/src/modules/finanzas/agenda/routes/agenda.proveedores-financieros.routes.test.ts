import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { NextFunction, Request, Response } from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { finanzasAgendaRouter } from './agenda.routes.js'
import {
  agregarProveedorFinanciero,
  listarProveedoresFinancieros,
  quitarProveedorFinanciero,
} from '../services/proveedores-financieros.service.js'

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

vi.mock('../services/compromisos.service.js', () => ({
  createCompromisoAgenda: vi.fn(),
  getCompromisoHistorialApi: vi.fn(),
  listCompromisosAgenda: vi.fn(async () => []),
  marcarCompromisoPagado: vi.fn(),
  patchCompromisoAgenda: vi.fn(),
  patchCompromisoUrgencia: vi.fn(),
}))

vi.mock('../services/cobros.service.js', () => ({
  confirmarCobro: vi.fn(),
  createCobroAgenda: vi.fn(),
  getCobroHistorialApi: vi.fn(),
  listCobrosAgenda: vi.fn(async () => []),
  patchCobroUrgencia: vi.fn(),
}))

vi.mock('../services/pagos-hechos.service.js', () => ({
  listarPagosHechos: vi.fn(async () => ({ desde: '', hasta: '', pagos: [] })),
  PagosHechosError: class extends Error {
    status = 400
  },
}))

vi.mock('../services/proveedores-financieros.service.js', () => ({
  listarProveedoresFinancieros: vi.fn(async () => []),
  agregarProveedorFinanciero: vi.fn(async () => ({
    id: 'pf1',
    nombre: 'Matriz',
    creadoPor: 'u1',
    createdAt: '2026-09-01T12:00:00.000Z',
  })),
  quitarProveedorFinanciero: vi.fn(async () => undefined),
  ProveedorFinancieroError: class extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message)
    }
  },
}))

let server: Server
let base = ''

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/agenda', finanzasAgendaRouter)
  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/agenda`
})

afterAll(() => new Promise<void>((r) => server.close(() => r())))

beforeEach(() => {
  vi.mocked(listarProveedoresFinancieros).mockClear()
  vi.mocked(agregarProveedorFinanciero).mockClear()
  vi.mocked(quitarProveedorFinanciero).mockClear()
})

const EDITOR = ['finanzas_agenda']

describe('rutas proveedores financieros', () => {
  it('lista sin permiso de edición', async () => {
    vi.mocked(listarProveedoresFinancieros).mockResolvedValueOnce([
      { id: 'pf1', nombre: 'Matriz', creadoPor: 'u1', createdAt: null },
    ])
    const res = await fetch(`${base}/proveedores-financieros`, {
      headers: { 'x-permisos': '' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      proveedores: [{ id: 'pf1', nombre: 'Matriz', creadoPor: 'u1', createdAt: null }],
    })
  })

  it('alta y baja requieren finanzas_agenda', async () => {
    expect(
      (
        await fetch(`${base}/proveedores-financieros`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-permisos': '' },
          body: JSON.stringify({ nombre: 'Matriz' }),
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await fetch(`${base}/proveedores-financieros/pf1`, {
          method: 'DELETE',
          headers: { 'x-permisos': '' },
        })
      ).status,
    ).toBe(403)
  })

  it('alta pasa el nombre y baja el id', async () => {
    const alta = await fetch(`${base}/proveedores-financieros`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-permisos': EDITOR.join(',') },
      body: JSON.stringify({ nombre: 'Matriz Finanzas' }),
    })
    expect(alta.status).toBe(201)
    expect(agregarProveedorFinanciero).toHaveBeenCalledWith('Matriz Finanzas', 'u1')

    const baja = await fetch(`${base}/proveedores-financieros/pf1`, {
      method: 'DELETE',
      headers: { 'x-permisos': EDITOR.join(',') },
    })
    expect(baja.status).toBe(204)
    expect(quitarProveedorFinanciero).toHaveBeenCalledWith('pf1')
  })
})
