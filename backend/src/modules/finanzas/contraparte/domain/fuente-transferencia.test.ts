import { describe, expect, it } from 'vitest'
import { identidadDeTransferencia, transferenciasCandidatas, type TransferenciaParaContraparte } from './fuente-transferencia.js'

const mov = {
  tipo: 'debito' as const,
  cuentaId: 'cordoba-cc',
  montoCentavos: 150000,
  fechaProceso: '2026-09-28',
}

function transferencia(partial: Partial<TransferenciaParaContraparte> = {}): TransferenciaParaContraparte {
  return {
    id: 'tr-1',
    cuentaDebitoId: 'cordoba-cc',
    montoCentavos: 150000,
    fecha: '2026-09-25',
    estado: 'efectivizada',
    destinoNombre: null,
    destinoCuit: null,
    cuentaCreditoCbu: null,
    compromisoPagoId: null,
    ...partial,
  }
}

describe('contraparte desde transferencias de BacarNet', () => {
  it('un débito con la misma cuenta, el mismo monto y dentro de los 5 días hábiles coincide', () => {
    const candidatas = transferenciasCandidatas(mov, [transferencia()])
    expect(candidatas.map((fila) => fila.id)).toEqual(['tr-1'])
  })

  it('un crédito no coincide, ni otra cuenta, ni otro monto, ni una fecha anterior', () => {
    expect(transferenciasCandidatas({ ...mov, tipo: 'credito' }, [transferencia()])).toEqual([])
    expect(transferenciasCandidatas(mov, [transferencia({ cuentaDebitoId: 'julio-cc' })])).toEqual([])
    expect(transferenciasCandidatas(mov, [transferencia({ montoCentavos: 150001 })])).toEqual([])
    expect(transferenciasCandidatas({ ...mov, fechaProceso: '2026-09-24' }, [transferencia()])).toEqual([])
  })

  it('ignora transferencias rechazadas o canceladas', () => {
    expect(transferenciasCandidatas(mov, [transferencia({ estado: 'rechazada' })])).toEqual([])
    expect(transferenciasCandidatas(mov, [transferencia({ estado: 'cancelada' })])).toEqual([])
  })

  it('si hay dos candidatas, las devuelve las dos para que no se elija ninguna', () => {
    const candidatas = transferenciasCandidatas(mov, [transferencia(), transferencia({ id: 'tr-2' })])
    expect(candidatas).toHaveLength(2)
  })

  it('el nombre sale del destino, si no de la agenda de CBU, si no del proveedor', () => {
    const porDestino = identidadDeTransferencia(
      transferencia({ destinoNombre: 'Flete Sur', destinoCuit: '30-11111111-1' }),
      new Map(),
      new Map(),
    )
    expect(porDestino).toEqual({ nombre: 'Flete Sur', cuit: '30111111111' })

    const porAgenda = identidadDeTransferencia(
      transferencia({ cuentaCreditoCbu: '0340000000000000000001' }),
      new Map([['0340000000000000000001', { nombre: 'Agenda SA', cuit: '27999999994' }]]),
      new Map(),
    )
    expect(porAgenda.nombre).toBe('Agenda SA')

    const porProveedor = identidadDeTransferencia(
      transferencia({ compromisoPagoId: 'comp-1' }),
      new Map(),
      new Map([['comp-1', { nombre: 'Proveedor Norte', cuit: null }]]),
    )
    expect(porProveedor).toEqual({ nombre: 'Proveedor Norte', cuit: null })
  })

  it('tolera que el destino y el CBU no existan', () => {
    expect(identidadDeTransferencia(transferencia(), new Map(), new Map())).toEqual({
      nombre: null,
      cuit: null,
    })
  })
})
