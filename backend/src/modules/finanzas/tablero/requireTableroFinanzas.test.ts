import type { Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthedUser, AuthedUserPermissions } from '../../auth/middleware.js'

const acceso = vi.hoisted(() => ({ tablero: true }))

vi.mock('../../../lib/firebase/admin.js', () => ({ adminDb: () => ({}), adminAuth: () => ({}) }))
vi.mock('../../boards/boardAccess.js', () => ({
  canViewBoard: async (_user: unknown, boardId: string) => boardId === 'carpeta-finanzas' && acceso.tablero,
}))

import { requireTableroFinanzas } from './requireTableroFinanzas.js'

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

async function correr(user?: AuthedUser) {
  const res = respuesta()
  const next = vi.fn()
  await requireTableroFinanzas({ authedUser: user } as Request, res, next)
  return { res, next }
}

describe('requireTableroFinanzas', () => {
  beforeEach(() => {
    acceso.tablero = true
    process.env.FINANZAS_BOARD_FOLDER_ID = 'carpeta-finanzas'
  })

  it('sin usuario responde 401', async () => {
    const { res, next } = await correr()
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('super admin pasa siempre, aunque el tablero no esté configurado', async () => {
    process.env.FINANZAS_BOARD_FOLDER_ID = ''
    expect((await correr(usuario({}, 'super_admin'))).next).toHaveBeenCalledOnce()
  })

  it('con acceso al tablero entra aunque no tenga el permiso del módulo Finanzas', async () => {
    expect((await correr(usuario({}))).next).toHaveBeenCalledOnce()
  })

  it('sin acceso al tablero responde 403', async () => {
    acceso.tablero = false
    const { res, next } = await correr(usuario({ view_finanzas: true }))
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('sin la carpeta configurada responde 503', async () => {
    process.env.FINANZAS_BOARD_FOLDER_ID = ''
    const { res, next } = await correr(usuario({ view_finanzas: true }))
    expect(res.statusCode).toBe(503)
    expect(res.body).toEqual({ error: 'Tablero de Finanzas no configurado' })
    expect(next).not.toHaveBeenCalled()
  })
})
