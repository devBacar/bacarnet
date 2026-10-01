import { describe, expect, it } from 'vitest'
import type { DetalleTransferenciaInterbanking } from '../adapters/interbanking-transferencias-details.js'
import {
  emparejarDetallesConTransferencias,
  type TransferenciaParaEmparejar,
} from './emparejar-detalle-transferencia.js'

function detalle(overrides: Partial<DetalleTransferenciaInterbanking> = {}): DetalleTransferenciaInterbanking {
  return {
    transferId: '100',
    transactionNumber: null,
    referenceNumber: 'OP-1',
    paymentNumber: null,
    lotNumber: null,
    comments: null,
    status: 'Confeccionada',
    amountCentavos: 150050,
    requestDate: '2026-09-29',
    debitCbu: '0340070800700370037009',
    debitAccountNumber: '07070037003700020',
    debitBankNumber: '034',
    creditCbu: '3050001101010001303450',
    creditAccountNumber: null,
    ...overrides,
  }
}

function transferencia(overrides: Partial<TransferenciaParaEmparejar> = {}): TransferenciaParaEmparejar {
  return {
    id: 't1',
    operationId: 'OP-1',
    confectionId: null,
    cuentaDebitoCbu: '0340070800700370037009',
    cuentaDebitoNumero: '07070037003700020',
    cuentaCreditoCbu: '3050001101010001303450',
    montoCentavos: 150050,
    fechaConfeccionDia: '2026-09-29',
    ...overrides,
  }
}

describe('emparejarDetallesConTransferencias', () => {
  it('usa el identificador guardado al confeccionar', () => {
    const resultado = emparejarDetallesConTransferencias(
      [transferencia({ operationId: 'OP-1', confectionId: '998877' })],
      [detalle({ referenceNumber: 'otra', transferId: '998877', status: 'Ejecutada' })],
    )
    expect(resultado).toEqual([
      { transferenciaId: 't1', detalle: expect.objectContaining({ status: 'Ejecutada' }), motivo: 'id' },
    ])
  })

  it('si hay id y no aparece, no adivina por monto', () => {
    const resultado = emparejarDetallesConTransferencias(
      [transferencia({ operationId: 'OP-ausente' })],
      [detalle({ referenceNumber: 'otra', transferId: '1' })],
    )
    expect(resultado[0]?.motivo).toBe('sin_coincidencia')
    expect(resultado[0]?.detalle).toBeNull()
  })

  it('sin id, empareja por débito, CBU crédito, monto y fecha si hay un solo candidato', () => {
    const resultado = emparejarDetallesConTransferencias(
      [transferencia({ operationId: '', confectionId: null })],
      [
        detalle({ referenceNumber: 'x', transferId: '1', amountCentavos: 1 }),
        detalle({ referenceNumber: 'y', transferId: '2', status: 'Autorizada' }),
      ],
    )
    expect(resultado[0]?.motivo).toBe('atributos')
    expect(resultado[0]?.detalle?.transferId).toBe('2')
  })

  it('sin id, no elige si hay dos candidatos iguales', () => {
    const resultado = emparejarDetallesConTransferencias(
      [
        transferencia({ id: 'a', operationId: '' }),
        transferencia({ id: 'b', operationId: '' }),
      ],
      [detalle({ referenceNumber: 'x', transferId: '1' })],
    )
    expect(resultado.map((item) => item.motivo)).toEqual(['ambiguo', 'ambiguo'])
  })
})
