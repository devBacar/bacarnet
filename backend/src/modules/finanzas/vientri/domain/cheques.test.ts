import { describe, expect, it } from 'vitest'
import { armarCheques, estadoDesdeChq } from './cheques.js'
import type { FilaCsv } from './csv.js'
import type { VientriPersonaDoc } from './tipos.js'

// Datos inventados: no son cheques reales.
const persona = (id: number, nombre: string): VientriPersonaDoc => ({
  vientriId: id, nombre, nombreFantasia: null, cuit: null, esCliente: false, esProveedor: false,
  inactivo: false, incobrable: false, limiteCreditoCentavos: null, plazoPagoClienteDias: null,
  ultimoPagoCliente: null, plazoPagoProveedorDias: null, cbu: null, baja: false,
})
const cat = {
  personas: new Map([[1, persona(1, 'EMPRESA PROPIA')], [50, persona(50, 'Cliente Uno')], [60, persona(60, 'Proveedor Dos')]]),
  bancos: new Map([[20, 'Banco A'], [30, 'Banco B']]),
}

function chq(p: Partial<FilaCsv>): FilaCsv {
  return {
    vientri_id: '1', numero: 'E-CHEQ 00000001', id_banco: '20', echeq: '1', librador_es_bacar: '0',
    id_persona_librador: '50', id_persona_entrega: '50', id_persona_recibe: '', cuit_librador: '',
    importe: '1000.00', id_estado: '1', rechazado: '0', fecha_vto: '2026-11-01', fecha_emision: '2026-10-01',
    fecha_recibido: '', fecha_deposito: '', fecha_entregado: '', baja: '0', fecsys: '2026-10-15T10:00:00', ...p,
  }
}
function oca(p: Partial<FilaCsv>): FilaCsv {
  return {
    vientri_id: '900', numero: '00000099', numero_completo: '020-111-2222-00000099', id_banco: '20',
    importe: '500.00', pagado: '0', fecha_vto: '2027-01-10', fecha_emision: '2026-10-01', fecha_conciliado: '',
    id_cheque: '', id_persona_recibe: '60', destinatario: 'Proveedor Dos', id_estado: '0', baja: '0', fecsys: '', ...p,
  }
}

describe('estadoDesdeChq', () => {
  it('traduce los estados confirmados de Vientri según el librador', () => {
    expect(estadoDesdeChq(1, false, false)).toBe('en_cartera')
    expect(estadoDesdeChq(8, false, false)).toBe('vendido')
    expect(estadoDesdeChq(4, true, false)).toBe('pendiente_debito')
    expect(estadoDesdeChq(10, true, false)).toBe('debitado')
    expect(estadoDesdeChq(10, false, false)).toBe('entregado')
    expect(estadoDesdeChq(10, false, true)).toBe('rechazado')
    expect(estadoDesdeChq(99, false, false)).toBe('otro')
  })
})

describe('armarCheques', () => {
  it('descarta el estado 5 que tiene un gemelo con el mismo número, banco e importe', () => {
    const r = armarCheques(
      [
        chq({ vientri_id: '10', numero: '00001234', id_estado: '5' }),
        chq({ vientri_id: '11', numero: '00001234', id_estado: '8' }),
        chq({ vientri_id: '12', numero: '00005678', id_estado: '5' }),
      ],
      [],
      cat,
    )
    expect(r.cheques.map((c) => c.clave).sort()).toEqual(['chq-11', 'chq-12'])
    expect(r.resumen.duplicadosEstado5).toBe(1)
    expect(r.cheques.find((c) => c.clave === 'chq-12')?.estado).toBe('otro')
  })

  it('separa emitidos y recibidos por el librador, no por la tabla', () => {
    const r = armarCheques(
      [chq({ vientri_id: '1' }), chq({ vientri_id: '2', numero: 'E-CHEQ 00000002', librador_es_bacar: '1', id_estado: '10' })],
      [],
      cat,
    )
    const porClave = new Map(r.cheques.map((c) => [c.clave, c]))
    expect(porClave.get('chq-1')?.direccion).toBe('recibido')
    expect(porClave.get('chq-1')?.librador?.nombre).toBe('Cliente Uno')
    expect(porClave.get('chq-2')?.direccion).toBe('emitido')
    expect(porClave.get('chq-2')?.estado).toBe('debitado')
  })

  it('une un cheque propio que está en las dos tablas (por serie, banco e importe) y no lo duplica', () => {
    const r = armarCheques(
      [chq({ vientri_id: '7', numero: '020-111-2222-00000099', echeq: '0', librador_es_bacar: '1', id_estado: '4', importe: '500.00' })],
      [oca({ id_cheque: '12345', pagado: '1', fecha_conciliado: '2027-01-11' })],
      cat,
    )
    expect(r.cheques).toHaveLength(1)
    expect(r.cheques[0].fuentes).toEqual(['Chq', 'CHQOCA'])
    expect(r.cheques[0].estado).toBe('debitado')
    expect(r.cheques[0].fechaConciliado).toBe('2027-01-11')
    expect(r.resumen.unidosPorNumero).toBe(1)
  })

  it('usa el enlace IDCHQ solo si coincide el importe', () => {
    const r = armarCheques(
      [chq({ vientri_id: '7', numero: '999-00000077', librador_es_bacar: '1', id_estado: '4', importe: '800.00' })],
      [oca({ id_cheque: '7', importe: '500.00' })],
      cat,
    )
    expect(r.cheques).toHaveLength(2)
    expect(r.resumen.unidosPorId).toBe(0)
    expect(r.resumen.soloChqoca).toBe(1)
  })

  it('un cheque propio que solo está en CHQOCA es un emitido real; fecha imposible queda para revisar', () => {
    const r = armarCheques([], [oca({ fecha_vto: '2120-04-07' })], cat)
    expect(r.cheques).toHaveLength(1)
    expect(r.cheques[0].direccion).toBe('emitido')
    expect(r.cheques[0].estado).toBe('pendiente_debito')
    expect(r.cheques[0].revisar.join()).toMatch(/imposible/)
  })

  it('descarta el dado de baja si hay otro vivo con el mismo número', () => {
    const r = armarCheques(
      [chq({ vientri_id: '1', baja: '1' }), chq({ vientri_id: '2' })],
      [],
      cat,
    )
    expect(r.cheques.map((c) => c.clave)).toEqual(['chq-2'])
    expect(r.resumen.bajasReemplazadas).toBe(1)
  })

  it('si hay dos candidatos para unir no adivina', () => {
    const base = { numero: '020-111-2222-00000099', echeq: '0', librador_es_bacar: '1', id_estado: '4', importe: '500.00' }
    const r = armarCheques([chq({ ...base, vientri_id: '7' }), chq({ ...base, vientri_id: '8' })], [oca({})], cat)
    expect(r.resumen.ambiguos).toBe(1)
    expect(r.cheques).toHaveLength(3)
  })
})
