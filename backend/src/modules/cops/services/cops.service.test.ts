import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CopsServiceError, obtenerSnapshotCops, vaciarCacheCops } from './cops.service.js'

const snapshotOk = {
  empresaId: 'emp-1',
  empresaNombre: 'Empresa demo',
  timestamp: '2026-10-29T14:30:00.000Z',
  clientes: { activos: 12, total: 15 },
  objetivos: 40,
  empleados: { activos: 200 },
  sla: { contratos: 8, horasMes: 48350 },
  operacionHoy: { enServicio: 80, deFranco: 20, ausentes: 0, vacantes: 0, novedades: 1 },
  planificacion: {
    proximoMes: '2026-11',
    objetivosPublicados: 36,
    objetivosTotal: 40,
    pctPublicado: 90,
  },
}

describe('obtenerSnapshotCops', () => {
  beforeEach(() => {
    vaciarCacheCops()
    process.env.COPS_ENDPOINT = 'https://example.test/getDashboardSnapshot'
    process.env.COPS_EMPRESA_ID = 'emp-1'
    process.env.COPS_API_KEY = 'clave-de-prueba'
  })

  afterEach(() => {
    delete process.env.COPS_ENDPOINT
    delete process.env.COPS_EMPRESA_ID
    delete process.env.COPS_API_KEY
  })

  it('sin env configurado responde 503', async () => {
    delete process.env.COPS_API_KEY
    await expect(obtenerSnapshotCops()).rejects.toMatchObject({ status: 503 })
  })

  it('devuelve el snapshot y lo cachea 5 min', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => snapshotOk,
    })
    const a = await obtenerSnapshotCops(fetchFn as unknown as typeof fetch)
    const b = await obtenerSnapshotCops(fetchFn as unknown as typeof fetch)
    expect(a.empresaNombre).toBe('Empresa demo')
    expect(b.sla.horasMes).toBe(48350)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('empresaId=emp-1')
    expect((opts.headers as Record<string, string>)['x-api-key']).toBe('clave-de-prueba')
  })

  it('401 del externo se traduce a mensaje de acceso COPS', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    await expect(obtenerSnapshotCops(fetchFn as unknown as typeof fetch)).rejects.toBeInstanceOf(CopsServiceError)
    await expect(obtenerSnapshotCops(fetchFn as unknown as typeof fetch)).rejects.toMatchObject({
      status: 401,
      message: 'Acceso no autorizado — contactar a administrador COSP',
    })
  })

  it('respuesta inválida responde 502', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ empresaId: 'x' }),
    })
    await expect(obtenerSnapshotCops(fetchFn as unknown as typeof fetch)).rejects.toMatchObject({ status: 502 })
  })
})
