import { describe, expect, it } from 'vitest'
import { armarDesglosesPago } from './desglose-pago.js'
import type { FilaCsv } from './csv.js'

function fila(obj: Record<string, string>): FilaCsv {
  return obj
}

describe('armarDesglosesPago', () => {
  it('caso real Permaquim: 3 e-cheques con vencimiento propio + retención excluida', () => {
    const comprobantes = [fila({ vientri_id: '916283', fecha: '2026-10-27' })]
    const aplicaciones = [
      fila({ id_cmp: '916283', id_cmp_cancelado: '906949', importe: '11783524.50', baja: '0' }),
      fila({ id_cmp: '916283', id_cmp_cancelado: '908696', importe: '9932224.50', baja: '0' }),
    ]
    const mediosPago = [
      fila({ id_cmp: '916283', id_medio: '25', importe: '719620.11', id_cheque: '0' }),
      fila({ id_cmp: '916283', id_medio: '47', importe: '14271767.55', id_cheque: '72978' }),
      fila({ id_cmp: '916283', id_medio: '47', importe: '14271767.55', id_cheque: '72979' }),
      fila({ id_cmp: '916283', id_medio: '47', importe: '14271767.54', id_cheque: '72980' }),
    ]
    const cheques = [
      fila({ vientri_id: '72978', fecha_vto: '2027-02-05', echeq: '1', numero: 'E-CHEQ 50099117' }),
      fila({ vientri_id: '72979', fecha_vto: '2027-03-05', echeq: '1', numero: 'E-CHEQ 50099119' }),
      fila({ vientri_id: '72980', fecha_vto: '2027-04-05', echeq: '1', numero: 'E-CHEQ 50099120' }),
    ]

    const desgloses = armarDesglosesPago(comprobantes, aplicaciones, mediosPago, cheques)
    const factura = desgloses.get(906949)
    expect(factura).toBeDefined()
    // La retención (id_medio 25) no aparece: no es plata que sale. Solo quedan los 3 e-cheques.
    expect(factura!.legs).toHaveLength(3)
    expect(factura!.legs.every((l) => l.medio === 'echeq')).toBe(true)
    expect(factura!.legs.map((l) => l.fechaVencimiento).sort()).toEqual(['2027-02-05', '2027-03-05', '2027-04-05'])
    // Prorrateado: 906949 es 11.783.524,50 de un total de 43.534.922,75 → ~27,07% de cada echeque.
    const totalFactura = factura!.legs.reduce((s, l) => s + l.montoCentavos, 0)
    expect(totalFactura).toBeCloseTo(1178352450 * (1 - 719620.11 / 43534922.75), -2)
  })

  it('orden pagada por transferencia (sin cheque): vence el mismo día de la orden', () => {
    const comprobantes = [fila({ vientri_id: '916404', fecha: '2026-10-29' })]
    const aplicaciones = [fila({ id_cmp: '916404', id_cmp_cancelado: '839803', importe: '198636.71', baja: '0' })]
    const mediosPago = [fila({ id_cmp: '916404', id_medio: '11', importe: '198636.71', id_cheque: '0' })]
    const desgloses = armarDesglosesPago(comprobantes, aplicaciones, mediosPago, [])
    const factura = desgloses.get(839803)
    expect(factura!.legs).toEqual([{ medio: 'otro_medio', fechaVencimiento: '2026-10-29', montoCentavos: 19863671, chequeNumero: null }])
  })

  it('aplicación dada de baja no cuenta', () => {
    const aplicaciones = [fila({ id_cmp: '1', id_cmp_cancelado: '2', importe: '100', baja: '1' })]
    const mediosPago = [fila({ id_cmp: '1', id_medio: '11', importe: '100', id_cheque: '0' })]
    const desgloses = armarDesglosesPago([], aplicaciones, mediosPago, [])
    expect(desgloses.has(2)).toBe(false)
  })

  it('cheque físico (echeq=0) se distingue de e-cheq', () => {
    const comprobantes = [fila({ vientri_id: '1', fecha: '2026-10-29' })]
    const aplicaciones = [fila({ id_cmp: '1', id_cmp_cancelado: '2', importe: '500', baja: '0' })]
    const mediosPago = [fila({ id_cmp: '1', id_medio: '47', importe: '500', id_cheque: '10' })]
    const cheques = [fila({ vientri_id: '10', fecha_vto: '2027-01-01', echeq: '0', numero: '00012345' })]
    const desgloses = armarDesglosesPago(comprobantes, aplicaciones, mediosPago, cheques)
    expect(desgloses.get(2)!.legs[0]).toMatchObject({ medio: 'cheque_fisico', fechaVencimiento: '2027-01-01', chequeNumero: '00012345' })
  })
})
