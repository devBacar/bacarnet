import type { CobroEsperadoDocument, CompromisoPagoDocument } from './agenda.types.js'

export type CompromisosAgendaVista = 'pendientes' | 'pagados'
export type CobrosAgendaVista = 'esperados' | 'cobrados'

export function filterCompromisosByVista(
  rows: Array<{ id: string; data: CompromisoPagoDocument }>,
  vista: CompromisosAgendaVista,
): Array<{ id: string; data: CompromisoPagoDocument }> {
  if (vista === 'pagados') {
    return rows.filter(({ data }) => data.estado === 'pagado')
  }
  return rows.filter(({ data }) => data.estado === 'pendiente' || data.estado === 'vencido')
}

export function filterCobrosByVista(
  rows: Array<{ id: string; data: CobroEsperadoDocument }>,
  vista: CobrosAgendaVista,
): Array<{ id: string; data: CobroEsperadoDocument }> {
  if (vista === 'cobrados') {
    return rows.filter(({ data }) => data.estado === 'confirmado')
  }
  return rows.filter(({ data }) => data.estado === 'esperado')
}
