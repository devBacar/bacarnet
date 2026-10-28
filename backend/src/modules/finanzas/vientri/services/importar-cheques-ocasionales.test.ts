import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../lib/firebase/admin.js', () => ({ adminDb: vi.fn() }))

vi.mock('../../agenda/services/proveedores-financieros.repository.js', () => ({
  nombresNormalizadosProveedoresFinancieros: vi.fn(async () => new Set(['presta plata', 'cambia dolares'])),
}))

vi.mock('./vientri.repository.js', () => ({
  sincronizarColeccion: vi.fn(async () => ({ nuevos: 3, cambiados: 0, iguales: 0, borrados: 0 })),
  crearImportacion: vi.fn(async () => 'imp-test-001'),
  cerrarImportacion: vi.fn(async () => {}),
}))

import { importarChequesOcasionales } from './importar-cheques-ocasionales.js'
import { sincronizarColeccion } from './vientri.repository.js'

const mockSync = vi.mocked(sincronizarColeccion)

const CSV_HEADER = 'vientri_id;numero;numero_completo;id_banco;importe;pagado;fecha_vto;fecha_emision;id_estado;baja;destinatario;obs;id_cheque;fecha_conciliado;id_persona_recibe'

function fila(overrides: Record<string, string> = {}): string {
  const d: Record<string, string> = {
    vientri_id: '100', numero: '44001234', numero_completo: '020-111-2222-44001234',
    id_banco: '20', importe: '5000000.00', pagado: '0', fecha_vto: '2027-01-15',
    fecha_emision: '2026-10-01', id_estado: '0', baja: '0', destinatario: 'Alguien Normal',
    obs: '', id_cheque: '', fecha_conciliado: '', id_persona_recibe: '60',
  }
  const merged = { ...d, ...overrides }
  return [
    merged.vientri_id, merged.numero, merged.numero_completo, merged.id_banco,
    merged.importe, merged.pagado, merged.fecha_vto, merged.fecha_emision,
    merged.id_estado, merged.baja, merged.destinatario, merged.obs,
    merged.id_cheque, merged.fecha_conciliado, merged.id_persona_recibe,
  ].join(';')
}

describe('importarChequesOcasionales', () => {
  it('parsea CSV con renovación y USD y clasifica proveedores financieros', async () => {
    const csv = [
      CSV_HEADER,
      fila({ vientri_id: '1', numero: '44001111', destinatario: 'Presta Plata', obs: 'Renovacion cheques n° 44000999, 44000998' }),
      fila({ vientri_id: '2', numero: '44002222', destinatario: 'Cambia Dolares', obs: 'u$50.000 TC1550' }),
      fila({ vientri_id: '3', numero: '44003333', destinatario: 'Proveedor Real', obs: 'Op' }),
    ].join('\n')

    const r = await importarChequesOcasionales({ csv, origen: 'script', actor: 'test', simular: true })

    expect(r.ok).toBe(true)
    expect(r.resumen.filas).toBe(3)
    expect(r.resumen.parseados).toBe(3)
    expect(r.resumen.conRenovacion).toBe(1)
    expect(r.resumen.conUsd).toBe(1)
    expect(r.resumen.proveedoresFinancieros).toBe(2)
  })

  it('resuelve renovadoPor como link inverso', async () => {
    mockSync.mockClear()
    const csv = [
      CSV_HEADER,
      fila({ vientri_id: '10', numero: '44000999', numero_completo: '020-111-2222-44000999', destinatario: 'Presta Plata', obs: '' }),
      fila({ vientri_id: '11', numero: '44001111', numero_completo: '020-111-2222-44001111', destinatario: 'Presta Plata', obs: 'Renovacion cheque n° 44000999' }),
    ].join('\n')

    await importarChequesOcasionales({ csv, origen: 'script', actor: 'test', simular: true })

    const input = mockSync.mock.calls[0]![0]
    const viejo = input.docs.find((d) => d.id === '10')
    const nuevo = input.docs.find((d) => d.id === '11')

    const viejoData = viejo?.data as unknown as { renovadoPor: string[] }
    const nuevoData = nuevo?.data as unknown as { renovacionDe: string[] }

    expect(viejoData.renovadoPor).toEqual(['020-111-2222-44001111'])
    expect(nuevoData.renovacionDe).toEqual(['44000999'])
  })

  it('marca fechas imposibles para revisar', async () => {
    const csv = [
      CSV_HEADER,
      fila({ vientri_id: '5', fecha_vto: '2120-04-07' }),
    ].join('\n')

    const r = await importarChequesOcasionales({ csv, origen: 'script', actor: 'test', simular: true })
    expect(r.resumen.fechasImposibles).toBe(1)
  })
})
