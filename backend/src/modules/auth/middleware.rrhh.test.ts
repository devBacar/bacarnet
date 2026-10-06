import type { Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthedUser, AuthedUserPermissions } from './middleware.js'

const modulo = vi.hoisted(() => ({ rrhhEnabled: true }))

vi.mock('../../lib/firebase/admin.js', () => ({
  adminDb: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: true,
          get: (field: string) => (field === 'rrhhEnabled' ? modulo.rrhhEnabled : undefined),
        }),
      }),
    }),
  }),
  adminAuth: () => ({}),
}))

import { permisosDesdePerfil, requireRrhh } from './middleware.js'

function usuario(permissions: AuthedUserPermissions, role?: string): AuthedUser {
  return {
    uid: 'uid-1',
    email: 'ana@bacarsa.com.ar',
    displayName: 'Ana',
    role,
    managedAreaIds: [],
    actionGrants: {},
    permissions,
  }
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

function pedido(user?: AuthedUser): Request {
  return { authedUser: user } as Request
}

async function correr(nivel: 'ver' | 'detalle', user?: AuthedUser) {
  const res = respuesta()
  const next = vi.fn()
  await requireRrhh(nivel)(pedido(user), res, next)
  return { res, next }
}

describe('requireRrhh', () => {
  beforeEach(() => {
    modulo.rrhhEnabled = true
  })

  it('sin usuario responde 401', async () => {
    const { res, next } = await correr('ver')
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('super admin pasa aunque el módulo esté apagado', async () => {
    modulo.rrhhEnabled = false
    const { next } = await correr('detalle', usuario({}, 'super_admin'))
    expect(next).toHaveBeenCalledOnce()
  })

  it('con el módulo apagado responde 403', async () => {
    modulo.rrhhEnabled = false
    const { res, next } = await correr('ver', usuario({ view_rrhh: true }))
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('view_rrhh pasa en ver y no en detalle', async () => {
    expect((await correr('ver', usuario({ view_rrhh: true }))).next).toHaveBeenCalledOnce()
    const detalle = await correr('detalle', usuario({ view_rrhh: true }))
    expect(detalle.res.statusCode).toBe(403)
    expect(detalle.next).not.toHaveBeenCalled()
  })

  it('rrhh_detalle implica ver', async () => {
    expect((await correr('ver', usuario({ rrhh_detalle: true }))).next).toHaveBeenCalledOnce()
    expect((await correr('detalle', usuario({ rrhh_detalle: true }))).next).toHaveBeenCalledOnce()
  })

  it('sin permisos de RRHH responde 403', async () => {
    const { res, next } = await correr('ver', usuario({ view_finanzas: true }))
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('permisosDesdePerfil (RRHH)', () => {
  it('lee view_rrhh y rrhh_detalle solo si son true', () => {
    expect(permisosDesdePerfil({ view_rrhh: true, rrhh_detalle: 'si' })).toMatchObject({
      view_rrhh: true,
      rrhh_detalle: false,
    })
  })
})
