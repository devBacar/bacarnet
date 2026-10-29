import { describe, expect, it } from 'vitest'
import { validarSnapshot } from './validar.js'

function snapshotBase(extra: Record<string, unknown> = {}) {
  return {
    empresaId: 'emp-1',
    empresaNombre: 'Empresa demo',
    timestamp: '2026-10-29T14:30:00.000Z',
    clientes: { activos: 12, total: 15 },
    objetivos: 40,
    empleados: { activos: 200 },
    sla: { contratos: 8, horasMes: 48350 },
    operacionHoy: { enServicio: 80, deFranco: 20, ausentes: 2, vacantes: 1, novedades: 0 },
    planificacion: {
      proximoMes: '2026-11',
      objetivosPublicados: 30,
      objetivosTotal: 40,
      pctPublicado: 75,
    },
    ...extra,
  }
}

describe('validarSnapshot', () => {
  it('acepta el snapshot mínimo sin rrhh ni liquidacion', () => {
    const r = validarSnapshot(snapshotBase())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.rrhh).toBeUndefined()
      expect(r.data.liquidacion).toBeUndefined()
      expect(r.data.clientes.activos).toBe(12)
    }
  })

  it('incluye rrhh y liquidacion cuando vienen bien', () => {
    const r = validarSnapshot(
      snapshotBase({
        rrhh: {
          personalHoy: { M: 10, T: 8, N: 6, D12: 2, N12: 1, RET: 0, otros: 3 },
          licenciasHoy: 4,
          ausenciasMes: 12,
        },
        liquidacion: {
          periodoActual: 'Octubre 2026',
          cicloStart: '2026-10-01',
          cicloEnd: '2026-10-31',
          ftCiclo: 2,
        },
      }),
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.rrhh?.licenciasHoy).toBe(4)
      expect(r.data.liquidacion?.ftCiclo).toBe(2)
    }
  })

  it('ignora rrhh/liquidacion mal formados sin fallar', () => {
    const r = validarSnapshot(
      snapshotBase({
        rrhh: { personalHoy: { M: 1 }, licenciasHoy: 1 },
        liquidacion: { periodoActual: 'x' },
      }),
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.rrhh).toBeUndefined()
      expect(r.data.liquidacion).toBeUndefined()
    }
  })

  it('rechaza si faltan campos obligatorios', () => {
    expect(validarSnapshot(null).ok).toBe(false)
    expect(validarSnapshot({ ...snapshotBase(), clientes: { activos: 1 } }).ok).toBe(false)
    expect(validarSnapshot({ ...snapshotBase(), operacionHoy: { enServicio: 1 } }).ok).toBe(false)
  })
})
