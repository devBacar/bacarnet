import type { Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthedUser, AuthedUserPermissions } from '../auth/middleware.js'

const acceso = vi.hoisted(() => ({ tablero: true }))

vi.mock('../../lib/firebase/admin.js', () => ({ adminDb: () => ({}), adminAuth: () => ({}) }))
vi.mock('../boards/boardAccess.js', () => ({
  canViewBoard: async (_user: unknown, boardId: string) => boardId === 'carpeta-rrhh' && acceso.tablero,
}))

import { requireTableroRrhh } from './requireTableroRrhh.js'

function usuario(permissions: AuthedUserPermissions, role?: string): AuthedUser {
  return { uid: 'uid-1', email: 'ana@bacarsa.com.ar', displayName: 'Ana', role, managedAreaIds: [], actionGrants: {}, permissions }
}

function respuesta() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: unknown) {
      this.body = body
      return this
    },
  }
  return res as Response & { statusCode: number; body: unknown }
}

async function correr(nivel: 'ver' | 'detalle', user?: AuthedUser) {
  const res = respuesta()
  const next = vi.fn()
  await requireTableroRrhh(nivel)({ authedUser: user } as Request, res, next)
  return { res, next }
}

describe('requireTableroRrhh', () => {
  beforeEach(() => {
    acceso.tablero = true
    process.env.RRHH_BOARD_FOLDER_ID = 'carpeta-rrhh'
  })

  it('sin usuario responde 401', async () => {
    const { res, next } = await correr('ver')
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('super admin pasa siempre, aunque el tablero no esté configurado', async () => {
    process.env.RRHH_BOARD_FOLDER_ID = ''
    expect((await correr('detalle', usuario({}, 'super_admin'))).next).toHaveBeenCalledOnce()
  })

  it('con acceso al tablero ve los totales, pero no el detalle sin rrhh_detalle', async () => {
    expect((await correr('ver', usuario({}))).next).toHaveBeenCalledOnce()
    const detalle = await correr('detalle', usuario({}))
    expect(detalle.res.statusCode).toBe(403)
    expect(detalle.next).not.toHaveBeenCalled()
  })

  it('con acceso al tablero y rrhh_detalle ve el detalle', async () => {
    expect((await correr('detalle', usuario({ rrhh_detalle: true }))).next).toHaveBeenCalledOnce()
  })

  it('sin acceso al tablero responde 403, aunque tenga rrhh_detalle', async () => {
    acceso.tablero = false
    const { res, next } = await correr('detalle', usuario({ rrhh_detalle: true }))
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('sin la carpeta configurada responde 503', async () => {
    process.env.RRHH_BOARD_FOLDER_ID = ''
    expect((await correr('ver', usuario({ rrhh_detalle: true }))).res.statusCode).toBe(503)
  })
})
