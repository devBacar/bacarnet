import { describe, expect, it } from 'vitest'
import { decideAreaShareSync } from './areaShares.js'

describe('decideAreaShareSync', () => {
  it('da el permiso que falta si pertenece al área y no tiene acceso', () => {
    expect(
      decideAreaShareSync({
        belongsToArea: true,
        tracked: null,
        existing: null,
      }),
    ).toEqual({ kind: 'grant' })
  })

  it('no toca un permiso dado a mano', () => {
    expect(
      decideAreaShareSync({
        belongsToArea: true,
        tracked: null,
        existing: { id: 'perm-manual', inherited: false },
      }),
    ).toEqual({ kind: 'skip-manual' })
  })

  it('no vuelve a dar acceso si la regla ya lo registró', () => {
    expect(
      decideAreaShareSync({
        belongsToArea: true,
        tracked: { permissionId: 'perm-area' },
        existing: { id: 'perm-area', inherited: false },
      }),
    ).toEqual({ kind: 'noop' })
  })

  it('saca solo el permiso que dio la regla cuando ya no pertenece al área', () => {
    expect(
      decideAreaShareSync({
        belongsToArea: false,
        tracked: { permissionId: 'perm-area' },
        existing: { id: 'perm-area', inherited: false },
      }),
    ).toEqual({ kind: 'revoke', permissionId: 'perm-area' })
  })

  it('no saca nada si se fue del área pero el acceso no vino de una regla', () => {
    expect(
      decideAreaShareSync({
        belongsToArea: false,
        tracked: null,
        existing: { id: 'perm-manual', inherited: false },
      }),
    ).toEqual({ kind: 'noop' })
  })

  it('no pisa un acceso heredado', () => {
    expect(
      decideAreaShareSync({
        belongsToArea: true,
        tracked: null,
        existing: { id: 'perm-heredado', inherited: true },
      }),
    ).toEqual({ kind: 'skip-inherited' })
  })
})
