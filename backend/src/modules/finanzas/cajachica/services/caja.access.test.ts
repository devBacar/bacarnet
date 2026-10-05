import { describe, expect, it } from 'vitest'
import type { AuthedUser, AuthedUserPermissions } from '../../../auth/middleware.js'
import { puedeCerrarCaja } from './caja.access.js'

function usuario(permissions: AuthedUserPermissions, extra?: Partial<AuthedUser>): AuthedUser {
  return {
    uid: 'uid-consulta',
    email: 'ana@bacarsa.com.ar',
    displayName: 'Ana',
    managedAreaIds: [],
    actionGrants: {},
    permissions,
    ...extra,
  }
}

describe('puedeCerrarCaja', () => {
  const responsable = 'uid-encargado'

  it('deja cerrar al encargado de esa caja', () => {
    expect(puedeCerrarCaja(usuario({}, { uid: responsable }), responsable)).toBe(true)
  })

  it('deja cerrar al líder de cajas aunque no sea el encargado', () => {
    expect(puedeCerrarCaja(usuario({ manage_finanzas_caja: true }), responsable)).toBe(true)
  })

  it('deja cerrar al super admin', () => {
    expect(puedeCerrarCaja(usuario({}, { role: 'super_admin' }), responsable)).toBe(true)
    expect(puedeCerrarCaja(usuario({ super_admin: true }), responsable)).toBe(true)
  })

  it('no deja cerrar a quien solo puede ver Finanzas', () => {
    expect(puedeCerrarCaja(usuario({ view_finanzas: true }), responsable)).toBe(false)
  })

  it('no deja cerrar a otra persona sin permiso de líder', () => {
    expect(puedeCerrarCaja(usuario({}), responsable)).toBe(false)
  })
})
