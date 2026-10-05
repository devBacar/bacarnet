import type { Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthedUser } from '../auth/middleware.js'

const writeAuditLog = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('./writeAuditLog.js', () => ({
  writeAuditLog,
}))

import { clientMayRecordAuditAction, recordClientAuditAction } from './recordClientAction.js'

function user(overrides: Partial<AuthedUser> = {}): AuthedUser {
  return {
    uid: 'uid-ana',
    email: 'ana@bacarsa.com.ar',
    displayName: 'Ana',
    role: 'user',
    managedAreaIds: [],
    actionGrants: {},
    permissions: {},
    ...overrides,
  }
}

function mockRes() {
  return {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: unknown) {
      this.payload = body
      return this
    },
  }
}

describe('clientMayRecordAuditAction', () => {
  it('permite role_change a quien gestiona usuarios o es super admin', () => {
    expect(clientMayRecordAuditAction(user(), 'role_change')).toBe(false)
    expect(clientMayRecordAuditAction(user({ role: 'admin' }), 'role_change')).toBe(false)
    expect(
      clientMayRecordAuditAction(user({ permissions: { manage_users: true } }), 'role_change'),
    ).toBe(true)
    expect(clientMayRecordAuditAction(user({ role: 'super_admin' }), 'role_change')).toBe(true)
  })

  it('permite create a un admin de área y no a un usuario común', () => {
    expect(clientMayRecordAuditAction(user(), 'create')).toBe(false)
    expect(clientMayRecordAuditAction(user({ role: 'admin' }), 'create')).toBe(true)
  })
})

describe('recordClientAuditAction', () => {
  beforeEach(() => {
    writeAuditLog.mockClear()
  })

  it('rechaza una acción fuera de la lista blanca', async () => {
    const res = mockRes()
    await recordClientAuditAction(
      { authedUser: user({ role: 'super_admin' }), body: { action: 'password_reset' } } as Request,
      res as unknown as Response,
    )
    expect(res.statusCode).toBe(400)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('escribe role_change con el usuario autenticado', async () => {
    const res = mockRes()
    const actor = user({ role: 'super_admin' })
    await recordClientAuditAction(
      {
        authedUser: actor,
        body: {
          action: 'role_change',
          targetType: 'user',
          targetId: 'uid-beto',
          targetName: 'Beto',
          metadata: { antes: 'user', despues: 'admin' },
        },
      } as Request,
      res as unknown as Response,
    )
    expect(res.statusCode).toBe(201)
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: actor.uid,
        userEmail: actor.email,
        action: 'role_change',
        targetType: 'user',
        targetId: 'uid-beto',
        metadata: { antes: 'user', despues: 'admin' },
      }),
    )
  })

  it('no deja que un usuario común registre un cambio de rol', async () => {
    const res = mockRes()
    await recordClientAuditAction(
      {
        authedUser: user(),
        body: {
          action: 'role_change',
          targetType: 'user',
          targetId: 'uid-beto',
          targetName: 'Beto',
        },
      } as Request,
      res as unknown as Response,
    )
    expect(res.statusCode).toBe(403)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})
