import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../lib/firebase/admin.js', () => ({ adminDb: vi.fn() }))

vi.mock('../../agenda/services/proveedores-financieros.repository.js', () => ({
  mapaProveedoresFinancieros: vi.fn(async () => new Map([
    ['presta plata', { id: 'provfin-presta plata', nombre: 'Presta Plata' }],
    ['cambia dolares', { id: 'provfin-cambia dolares', nombre: 'Cambia Dolares' }],
  ])),
}))

vi.mock('./vientri.repository.js', () => ({
  sincronizarColeccion: vi.fn(async () => ({ nuevos: 3, cambiados: 0, iguales: 0, borrados: 0 })),
  crearImportacion: vi.fn(async () => 'imp-test-001'),
  cerrarImportacion: vi.fn(async () => {}),
}))

vi.mock('./recalcular-seguimiento.js', () => ({
  recalcularSeguimiento: vi.fn(async () => ({ operaciones: 0, actualizados: 0 })),
}))

vi.mock('./completos-ocasionales.js', () => ({
  reconstruirCompletos: vi.fn(async () => ({ total: 3, reales: 3, sinteticos: 0, conteo: { nuevos: 3, cambiados: 0, iguales: 0, borrados: 0 } })),
}))

import {
  importarChequesOcasionales,
  REVISAR_PROVEEDOR_NO_CARGADO,
  REVISAR_SIN_DATOS_FINANCIEROS,
} from './importar-cheques-ocasionales.js'
import { sincronizarColeccion } from './vientri.repository.js'
import type { ChequeOcasionalDoc } from '../domain/cheque-ocasional.types.js'

const mockSync = vi.mocked(sincronizarColeccion)

function docGuardado(id: string): ChequeOcasionalDoc {
  const input = mockSync.mock.calls.at(-1)![0]
  return input.docs.find((d) => d.id === id)!.data as unknown as ChequeOcasionalDoc
}

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
  it('parsea CSV con renovación y USD; todos son financieros y el que no tiene datos queda a revisar', async () => {
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
    // Solo "Proveedor Real" (no cargado y con OBS sin datos financieros) queda a revisar.
    expect(r.resumen.aRevisar).toBe(1)
    for (const id of ['oca-1', 'oca-2', 'oca-3']) {
      expect(docGuardado(id).esProveedorFinanciero).toBe(true)
      expect(docGuardado(id).tipoProveedor).toBe('financiero')
    }
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
    const viejo = input.docs.find((d) => d.id === 'oca-10')
    const nuevo = input.docs.find((d) => d.id === 'oca-11')

    const viejoData = viejo?.data as unknown as { renovadoPor: string[] }
    const nuevoData = nuevo?.data as unknown as { renovacionDe: string[] }

    expect(viejoData.renovadoPor).toEqual(['020-111-2222-44001111'])
    expect(nuevoData.renovacionDe).toEqual(['44000999'])
  })

  it('guarda fechaConciliado cuando está presente', async () => {
    mockSync.mockClear()
    const csv = [
      CSV_HEADER,
      fila({ vientri_id: '20', fecha_conciliado: '2026-10-15' }),
      fila({ vientri_id: '21', fecha_conciliado: '' }),
    ].join('\n')

    await importarChequesOcasionales({ csv, origen: 'script', actor: 'test', simular: true })

    const input = mockSync.mock.calls[0]![0]
    const conFecha = input.docs.find((d) => d.id === 'oca-20')
    const sinFecha = input.docs.find((d) => d.id === 'oca-21')

    const conData = conFecha?.data as unknown as { fechaConciliado: string | null; pagado: boolean }
    const sinData = sinFecha?.data as unknown as { fechaConciliado: string | null; pagado: boolean }

    expect(conData.fechaConciliado).toBe('2026-10-15')
    expect(conData.pagado).toBe(true)
    expect(sinData.fechaConciliado).toBeNull()
    expect(sinData.pagado).toBe(false)
  })

  it('un proveedor cargado se vincula por su id real y no queda a revisar si el OBS tiene datos', async () => {
    const csv = [
      CSV_HEADER,
      fila({ vientri_id: '30', destinatario: 'PRESTA  plata', obs: 'Renovacion cheque n° 44009999' }),
    ].join('\n')

    await importarChequesOcasionales({ csv, origen: 'script', actor: 'test', simular: true })

    const d = docGuardado('oca-30')
    expect(d.proveedorFinancieroId).toBe('provfin-presta plata')
    expect(d.revisar).toEqual([])
  })

  it('un cheque viejo renovado por otro no queda a revisar aunque su OBS esté vacío', async () => {
    const csv = [
      CSV_HEADER,
      fila({ vientri_id: '70', numero: '44000999', numero_completo: '020-111-2222-44000999', destinatario: 'Presta Plata', obs: '' }),
      fila({ vientri_id: '71', numero: '44001111', numero_completo: '020-111-2222-44001111', destinatario: 'Presta Plata', obs: 'Renovacion cheque n° 44000999' }),
    ].join('\n')

    await importarChequesOcasionales({ csv, origen: 'script', actor: 'test', simular: true })

    expect(docGuardado('oca-70').revisar).toEqual([])
    expect(docGuardado('oca-71').revisar).toEqual([])
  })

  it('un proveedor cargado con OBS sin datos financieros queda a revisar', async () => {
    const csv = [
      CSV_HEADER,
      fila({ vientri_id: '31', destinatario: 'Presta Plata', obs: '' }),
    ].join('\n')

    await importarChequesOcasionales({ csv, origen: 'script', actor: 'test', simular: true })

    const d = docGuardado('oca-31')
    expect(d.esProveedorFinanciero).toBe(true)
    expect(d.revisar).toEqual([REVISAR_SIN_DATOS_FINANCIEROS])
  })

  it('"Renovación contrato alquiler" a un beneficiario no cargado es financiero pero queda a revisar por proveedor', async () => {
    const csv = [
      CSV_HEADER,
      fila({ vientri_id: '32', destinatario: 'Inmobiliaria X', obs: 'Renovación contrato alquiler' }),
    ].join('\n')

    await importarChequesOcasionales({ csv, origen: 'script', actor: 'test', simular: true })

    const d = docGuardado('oca-32')
    expect(d.esProveedorFinanciero).toBe(true)
    expect(d.proveedorFinancieroId).toBeNull()
    expect(d.revisar).toEqual([REVISAR_PROVEEDOR_NO_CARGADO])
  })

  it('lista los proveedores sin cargar sin repetir variantes de mayúsculas y espacios, también en simulación', async () => {
    const csv = [
      CSV_HEADER,
      fila({ vientri_id: '40', destinatario: 'Otro Financiero', obs: 'u$10.000 TC1500' }),
      fila({ vientri_id: '41', destinatario: 'OTRO  financiero', obs: 'u$10.000 TC1500' }),
      fila({ vientri_id: '42', destinatario: 'Presta Plata', obs: 'int' }),
    ].join('\n')

    const r = await importarChequesOcasionales({ csv, origen: 'script', actor: 'test', simular: true })

    expect(r.proveedoresSinCargar).toEqual(['Otro Financiero'])
  })

  it('los textos de revisar de la importación no contienen "imposible" (esa palabra oculta el cheque)', () => {
    expect(REVISAR_PROVEEDOR_NO_CARGADO.toLowerCase()).not.toContain('imposible')
    expect(REVISAR_SIN_DATOS_FINANCIEROS.toLowerCase()).not.toContain('imposible')
  })

  it('nunca borra lo que no viene en el CSV y solo actualiza los campos vivos de lo que ya estaba', async () => {
    mockSync.mockClear()
    const csv = [
      CSV_HEADER,
      fila({ vientri_id: '50', destinatario: 'Presta Plata', obs: 'int' }),
    ].join('\n')

    await importarChequesOcasionales({ csv, origen: 'manual', actor: 'test', simular: true })

    const input = mockSync.mock.calls[0]![0]
    expect(input.borrarFaltantes).toBe(false)
    expect(input.camposVivos).toEqual(['pagado', 'estado', 'estadoCodigo', 'fechaConciliado', 'baja'])
  })

  it('solo importa los que vencen desde la ventana cuando se pasa desde', async () => {
    mockSync.mockClear()
    const csv = [
      CSV_HEADER,
      fila({ vientri_id: '60', fecha_vto: '2024-01-10', pagado: '1', destinatario: 'Presta Plata', obs: 'int' }),
      fila({ vientri_id: '61', fecha_vto: '2026-11-10', destinatario: 'Presta Plata', obs: 'int' }),
    ].join('\n')

    await importarChequesOcasionales({ csv, origen: 'manual', actor: 'test', simular: true, desde: '2025-11-04' })

    const ids = mockSync.mock.calls[0]![0].docs.map((d) => d.id)
    expect(ids).toEqual(['oca-61'])
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
