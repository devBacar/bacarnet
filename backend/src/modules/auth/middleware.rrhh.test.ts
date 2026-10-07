import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/firebase/admin.js', () => ({ adminDb: () => ({}), adminAuth: () => ({}) }))

import { permisosDesdePerfil } from './middleware.js'

describe('permisosDesdePerfil (RRHH)', () => {
  it('lee rrhh_detalle solo si es true', () => {
    expect(permisosDesdePerfil({ rrhh_detalle: true }).rrhh_detalle).toBe(true)
    expect(permisosDesdePerfil({ rrhh_detalle: 'si' }).rrhh_detalle).toBe(false)
  })

  it('ya no existe view_rrhh: el acceso al tablero se da desde Tableros', () => {
    expect(permisosDesdePerfil({ view_rrhh: true })).not.toHaveProperty('view_rrhh')
  })
})
