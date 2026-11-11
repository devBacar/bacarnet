import { describe, expect, it } from 'vitest'
import { ocasionalParaVincular } from './ocasionales-vinculo.repository.js'

const base = {
  numeroCheque: '020-923-5000-39316371',
  montoCentavos: 5_650_000_00,
  fechaEmision: '2026-08-27',
  fechaVencimiento: '2026-10-11',
  fechaConciliado: '2026-11-06',
  estadoCodigo: 10,
  beneficiario: 'MANA',
  baja: false,
}

describe('ocasionales que se buscan en el banco', () => {
  it('un "Pago confirmado a proveedor" se busca por su fecha de conciliado, no por el vencimiento', () => {
    expect(ocasionalParaVincular('oca-1', base)).toMatchObject({ id: 'oca:oca-1', fechaPago: '2026-11-06', montoCentavos: 5_650_000_00 })
  })

  it('no se buscan los cancelados con la renovación (7), los pendientes, los de baja ni los ya vinculados', () => {
    expect(ocasionalParaVincular('a', { ...base, estadoCodigo: 7 })).toBeNull()
    expect(ocasionalParaVincular('a', { ...base, estadoCodigo: 0, fechaConciliado: null })).toBeNull()
    expect(ocasionalParaVincular('a', { ...base, estadoCodigo: 11 })).toBeNull()
    expect(ocasionalParaVincular('a', { ...base, baja: true })).toBeNull()
    expect(ocasionalParaVincular('a', { ...base, movimientoBancarioId: 'mov-1' })).toBeNull()
  })

  it('sin fecha de conciliado no hay contra qué buscar', () => {
    expect(ocasionalParaVincular('a', { ...base, fechaConciliado: null })).toBeNull()
  })
})
