import type { NextFunction, Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthedUser, AuthedUserPermissions, FinanzasPermisoClave } from './middleware.js'

const modulo = vi.hoisted(() => ({ finanzasEnabled: true }))

vi.mock('../../lib/firebase/admin.js', () => ({
  adminDb: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: true,
          get: (field: string) => (field === 'finanzasEnabled' ? modulo.finanzasEnabled : undefined),
        }),
      }),
    }),
  }),
  adminAuth: () => ({}),
}))

import {
  MENSAJE_FINANZAS_PERMISO,
  requireFinanzasPermiso,
  requireViewFinanzas,
} from './middleware.js'

const CLAVES = Object.keys(MENSAJE_FINANZAS_PERMISO) as FinanzasPermisoClave[]

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

describe('requireFinanzasPermiso', () => {
  beforeEach(() => {
    modulo.finanzasEnabled = true
  })

  it.each(CLAVES)('deja pasar con view_finanzas y %s', async (clave) => {
    const res = respuesta()
    const next = vi.fn()
    await requireFinanzasPermiso(clave)(
      pedido(usuario({ view_finanzas: true, [clave]: true })),
      res,
      next as NextFunction,
    )
    expect(next).toHaveBeenCalledOnce()
  })

  it.each(CLAVES)('responde 403 sin %s', async (clave) => {
    const res = respuesta()
    const next = vi.fn()
    await requireFinanzasPermiso(clave)(
      pedido(usuario({ view_finanzas: true })),
      res,
      next as NextFunction,
    )
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: MENSAJE_FINANZAS_PERMISO[clave] })
  })

  it.each(CLAVES)('no alcanza tener %s sin ver Finanzas', async (clave) => {
    const res = respuesta()
    const next = vi.fn()
    await requireFinanzasPermiso(clave)(
      pedido(usuario({ [clave]: true })),
      res,
      next as NextFunction,
    )
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: MENSAJE_FINANZAS_PERMISO[clave] })
  })

  it('el super admin pasa aunque no tenga la clave y el módulo esté apagado', async () => {
    modulo.finanzasEnabled = false
    const res = respuesta()
    const next = vi.fn()
    await requireFinanzasPermiso('finanzas_transferencias')(
      pedido(usuario({}, 'super_admin')),
      res,
      next as NextFunction,
    )
    expect(next).toHaveBeenCalledOnce()
  })

  it('el super admin por permiso pasa', async () => {
    const res = respuesta()
    const next = vi.fn()
    await requireFinanzasPermiso('finanzas_saldos')(
      pedido(usuario({ super_admin: true })),
      res,
      next as NextFunction,
    )
    expect(next).toHaveBeenCalledOnce()
  })

  it('con el módulo apagado responde 403', async () => {
    modulo.finanzasEnabled = false
    const res = respuesta()
    const next = vi.fn()
    await requireFinanzasPermiso('finanzas_agenda')(
      pedido(usuario({ view_finanzas: true, finanzas_agenda: true })),
      res,
      next as NextFunction,
    )
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'Finanzas no está habilitado' })
  })

  it('sin usuario responde 401', async () => {
    const res = respuesta()
    const next = vi.fn()
    await requireFinanzasPermiso('finanzas_cheques')(pedido(), res, next as NextFunction)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
  })
})

describe('requireViewFinanzas', () => {
  beforeEach(() => {
    modulo.finanzasEnabled = true
  })

  it('un líder de cajas sin view_finanzas no entra al resto de Finanzas', async () => {
    const res = respuesta()
    const next = vi.fn()
    await requireViewFinanzas(
      pedido(usuario({ manage_finanzas_caja: true })),
      res,
      next as NextFunction,
    )
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(403)
  })

  it('quien tiene view_finanzas entra', async () => {
    const res = respuesta()
    const next = vi.fn()
    await requireViewFinanzas(pedido(usuario({ view_finanzas: true })), res, next as NextFunction)
    expect(next).toHaveBeenCalledOnce()
  })
})
