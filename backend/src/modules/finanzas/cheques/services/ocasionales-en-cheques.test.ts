import { describe, expect, it } from 'vitest'
import type { ChequeOcasionalDoc } from '../../vientri/domain/cheque-ocasional.types.js'
import { itemCumpleFiltro, ocasionalAItem, sacarCopiasDeOcasionales } from './ocasionales-en-cheques.js'
import type { ChequeListadoItem, ChequesFiltro } from './cheques.repository.js'

function ocasional(partial: Partial<ChequeOcasionalDoc> = {}): ChequeOcasionalDoc {
  return {
    numeroCheque: '020-923-5000-40074068',
    beneficiario: 'DAVALOS',
    beneficiarioNormalizado: 'davalos',
    beneficiarioFormal: null,
    beneficiarioCuit: null,
    montoCentavos: 45_046_300,
    fechaVencimiento: '2026-10-30',
    fechaEmision: '2026-10-01',
    estadoCodigo: 4,
    estado: 'Pago a proveedor',
    pagado: false,
    esProveedorFinanciero: true,
    tipoProveedor: 'financiero',
    esRenovacion: false,
    renovacionDe: [],
    renovadoPor: [],
    operacionUsd: null,
    tasaExplicita: null,
    rolEnOperacion: null,
    obsOriginal: '',
    revisar: [],
    proveedorFinancieroId: null,
    vientriId: 77,
    fechaConciliado: null,
    vientriChqId: null,
    baja: false,
    ...partial,
  }
}

function copia(partial: Partial<ChequeListadoItem> = {}): ChequeListadoItem {
  return { ...ocasionalAItem('x', ocasional()), id: 'emitido_40074068', numero: '40074068', tipo: 'echeq', ocasionalEnriquecido: false, vientriClave: 'chq-1', ...partial }
}

const sinFiltro: ChequesFiltro = {
  direccion: 'emitido', origen: null, estado: null, tipo: null, desde: null, hasta: null,
  vinculacion: null, comprobante: null, q: null,
}

describe('ocasionales en la lista de Emitidos', () => {
  it('los muestra como cheque físico propio, con el estado según Vientri', () => {
    expect(ocasionalAItem('a', ocasional()).tipo).toBe('fisico')
    expect(ocasionalAItem('a', ocasional()).estado).toBe('pendiente')
    expect(ocasionalAItem('a', ocasional({ pagado: true })).estado).toBe('debitado')
    expect(ocasionalAItem('a', ocasional({ estadoCodigo: 5 })).estado).toBe('renovado')
    expect(ocasionalAItem('a', ocasional({ estadoCodigo: 13 })).estado).toBe('rechazado')
    expect(ocasionalAItem('a', ocasional()).id).toBe('oca:a')
  })

  it('el estado 7 (cancelado con la renovación) no se muestra como debitado aunque Vientri lo marque pagado', () => {
    const item = ocasionalAItem('a', ocasional({ estadoCodigo: 7, estado: 'Estado 7', pagado: true, fechaConciliado: '2026-09-22' }))
    expect(item.estado).toBe('renovado')
    expect(item.estadoBancario).toBe('Cancelado por renovación')
    expect(ocasionalAItem('a', ocasional({ estadoCodigo: 10, pagado: true })).estado).toBe('debitado')
  })

  it('saca de `cheques` la copia eCheq y la "oca-…", pero deja los demás cheques', () => {
    const oca = ocasionalAItem('a', ocasional())
    const echeq = copia()
    const extra = copia({ id: 'emitido_020-923-5000-40074068', numero: '020-923-5000-40074068', tipo: 'fisico', vientriClave: 'oca-77' })
    const otro = copia({ id: 'emitido_999', numero: '999', montoCentavos: 1_000 })
    const recibido = copia({ id: 'recibido_5', direccion: 'recibido' })
    const resultado = sacarCopiasDeOcasionales([echeq, extra, otro, recibido], [oca])
    expect(resultado.map((c) => c.id)).toEqual(['emitido_999', 'recibido_5'])
  })

  it('no saca un cheque con el mismo importe pero otro vencimiento', () => {
    const oca = ocasionalAItem('a', ocasional())
    const otraFecha = copia({ fechaPago: '2026-11-30' })
    expect(sacarCopiasDeOcasionales([otraFecha], [oca])).toHaveLength(1)
  })

  it('les aplica los mismos filtros que al resto', () => {
    const oca = ocasionalAItem('a', ocasional())
    expect(itemCumpleFiltro(oca, sinFiltro)).toBe(true)
    expect(itemCumpleFiltro(oca, { ...sinFiltro, direccion: 'recibido' })).toBe(false)
    expect(itemCumpleFiltro(oca, { ...sinFiltro, tipo: 'echeq' })).toBe(false)
    expect(itemCumpleFiltro(oca, { ...sinFiltro, tipo: 'fisico' })).toBe(true)
    expect(itemCumpleFiltro(oca, { ...sinFiltro, estado: 'debitado' })).toBe(false)
    expect(itemCumpleFiltro(oca, { ...sinFiltro, desde: '2026-11-01' })).toBe(false)
    expect(itemCumpleFiltro(oca, { ...sinFiltro, vinculacion: 'vinculado' })).toBe(false)
    expect(itemCumpleFiltro(oca, { ...sinFiltro, q: 'davalos' })).toBe(true)
    expect(itemCumpleFiltro(oca, { ...sinFiltro, q: 'otro' })).toBe(false)
    expect(itemCumpleFiltro(oca, { ...sinFiltro, montoMinCentavos: 50_000_000 })).toBe(false)
  })
})
