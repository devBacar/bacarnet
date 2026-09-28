import { describe, expect, it } from 'vitest'
import {
  amountToSignedCentavos,
  descripcionVisible,
  mapInterbankingMovement,
} from './movimiento-bancario.map.js'

const base = {
  cuentaId: 'patagonia-cc',
  bancoNombre: 'Patagonia' as const,
  bancoNumero: '034',
  numeroCuenta: '07070037003700020',
}

describe('movimiento bancario', () => {
  it('convierte importes con signo a centavos enteros', () => {
    expect(amountToSignedCentavos(8000000)).toBe(800_000_000)
    expect(amountToSignedCentavos(-81.84)).toBe(-8184)
    expect(amountToSignedCentavos(4892255.76)).toBe(489_225_576)
  })

  it('prioriza la descripción del banco y trata CUIT y depositante como opcionales', () => {
    const mapped = mapInterbankingMovement({
      ...base,
      row: {
        operation_code_bank: '00837',
        operation_code_ib: 'N24',
        code_description_bank: 'IMP.DB/CR BANCARIOS P/DEB',
        code_description_ib: 'IMPUESTO AL DEBITO',
        depositor_description: '   ',
        customer_cuit: '',
        amount: -81.84,
        voucher_number: 0,
        process_date: '2026-09-01T00:00:00',
        debit_credit_type: 'D',
        correlative_number: 1,
      },
    })
    expect(mapped.descripcion).toBe('IMP.DB/CR BANCARIOS P/DEB')
    expect(mapped.tipo).toBe('debito')
    expect(mapped.montoCentavos).toBe(8184)
    expect(mapped.fechaProceso).toBe('2026-09-01')
    expect(mapped.depositorDescription).toBeNull()
    expect(mapped.customerCuit).toBeNull()
    expect(mapped.voucherNumber).toBeNull()
    expect(mapped.correlativeNumber).toBe(1)
  })

  it('guarda comprobante y correlativo cuando vienen', () => {
    const mapped = mapInterbankingMovement({
      ...base,
      row: {
        operation_code_bank: '00210',
        operation_code_ib: '300',
        code_description_bank: 'CREDITO POR DATANET',
        amount: 4892255.76,
        voucher_number: 4214898,
        process_date: '2026-09-02T00:00:00',
        debit_credit_type: 'C',
        correlative_number: 13887,
      },
    })
    expect(mapped.tipo).toBe('credito')
    expect(mapped.montoCentavos).toBe(489_225_576)
    expect(mapped.voucherNumber).toBe(4214898)
    expect(mapped.correlativeNumber).toBe(13887)
  })

  it('usa la descripción de Interbanking solo si el banco no manda texto', () => {
    expect(
      descripcionVisible({
        code_description_bank: ' ',
        code_description_ib: 'TRF.DATA',
      }),
    ).toBe('TRF.DATA')
  })
})
