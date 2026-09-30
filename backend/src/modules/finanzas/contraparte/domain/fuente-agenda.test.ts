import { describe, expect, it } from 'vitest'
import { agendaCandidatos, type ItemAgenda } from './fuente-agenda.js'

function compromiso(partial: Partial<ItemAgenda> = {}): ItemAgenda {
  return {
    id: 'compromiso:1',
    tipo: 'compromiso',
    nombre: 'Taller Díaz',
    cuit: null,
    montoCentavos: 80000,
    fecha: '2026-09-30',
    cuentaId: null,
    estado: 'pagado',
    ...partial,
  }
}

const debito = {
  tipo: 'debito' as const,
  cuentaId: 'cordoba-cc',
  montoCentavos: 80000,
  fechaProceso: '2026-09-28',
}

describe('contraparte desde la Agenda', () => {
  it('un débito coincide con un compromiso del mismo monto a ±3 días hábiles', () => {
    expect(agendaCandidatos(debito, [compromiso()]).map((item) => item.id)).toEqual(['compromiso:1'])
  })

  it('un crédito coincide con un cobro, no con un compromiso', () => {
    const cobro = compromiso({ id: 'cobro:1', tipo: 'cobro', nombre: 'Cliente Paz' })
    const credito = { ...debito, tipo: 'credito' as const }
    expect(agendaCandidatos(credito, [compromiso(), cobro]).map((item) => item.nombre)).toEqual(['Cliente Paz'])
  })

  it('fuera de la ventana, con otro monto o incobrable, no coincide', () => {
    expect(agendaCandidatos({ ...debito, fechaProceso: '2026-09-01' }, [compromiso()])).toEqual([])
    expect(agendaCandidatos({ ...debito, montoCentavos: 1 }, [compromiso()])).toEqual([])
    expect(agendaCandidatos({ ...debito, tipo: 'credito' }, [compromiso({ tipo: 'cobro', estado: 'incobrable' })])).toEqual([])
  })

  it('si el compromiso tiene otra cuenta, no coincide; si no tiene cuenta, sí', () => {
    expect(agendaCandidatos(debito, [compromiso({ cuentaId: 'julio-cc' })])).toEqual([])
    expect(agendaCandidatos(debito, [compromiso({ cuentaId: null })])).toHaveLength(1)
  })

  it('dos compromisos del mismo monto dejan la elección en blanco', () => {
    expect(agendaCandidatos(debito, [compromiso(), compromiso({ id: 'compromiso:2' })])).toHaveLength(2)
  })
})
