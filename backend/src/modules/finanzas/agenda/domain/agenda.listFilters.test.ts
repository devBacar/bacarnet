import { Timestamp } from 'firebase-admin/firestore'
import { describe, expect, it } from 'vitest'
import type { CobroEsperadoDocument, CompromisoPagoDocument } from './agenda.types.js'
import { filterCobrosByVista, filterCompromisosByVista } from './agenda.listFilters.js'

const ts = Timestamp.fromDate(new Date('2026-03-10T12:00:00Z'))

function compromiso(estado: CompromisoPagoDocument['estado'], id: string) {
  return {
    id,
    data: {
      estado,
      fechaPago: estado === 'pagado' ? ts : null,
      fechaVencimiento: ts,
    } as CompromisoPagoDocument,
  }
}

function cobro(estado: CobroEsperadoDocument['estado'], id: string) {
  return {
    id,
    data: {
      estado,
      fechaConfirmado: estado === 'confirmado' ? ts : null,
      fechaEsperada: ts,
    } as CobroEsperadoDocument,
  }
}

describe('filterCompromisosByVista', () => {
  const rows = [
    compromiso('pendiente', 'a'),
    compromiso('vencido', 'b'),
    compromiso('pagado', 'c'),
  ]

  it('pendientes incluye pendiente y vencido', () => {
    const ids = filterCompromisosByVista(rows, 'pendientes').map((r) => r.id)
    expect(ids).toEqual(['a', 'b'])
  })

  it('pagados solo incluye pagado', () => {
    const ids = filterCompromisosByVista(rows, 'pagados').map((r) => r.id)
    expect(ids).toEqual(['c'])
  })
})

describe('filterCobrosByVista', () => {
  const rows = [cobro('esperado', 'x'), cobro('confirmado', 'y'), cobro('incobrable', 'z')]

  it('esperados solo incluye esperado', () => {
    const ids = filterCobrosByVista(rows, 'esperados').map((r) => r.id)
    expect(ids).toEqual(['x'])
  })

  it('cobrados solo incluye confirmado', () => {
    const ids = filterCobrosByVista(rows, 'cobrados').map((r) => r.id)
    expect(ids).toEqual(['y'])
  })
})
