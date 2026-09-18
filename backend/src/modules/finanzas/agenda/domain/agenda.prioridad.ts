/** Override opcional de orden; sin valor → solo fecha de vencimiento/esperada. */
export type PrioridadUrgencia = 'alta' | 'media' | 'baja'

export const PRIORIDAD_URGENCIA_LABEL: Record<PrioridadUrgencia, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

/** Menor = más urgente en la grilla. Sin urgencia = 3 (después de Alta/Media/Baja). */
export function urgenciaSortRank(urgencia: PrioridadUrgencia | null | undefined): number {
  if (urgencia === 'alta') return 0
  if (urgencia === 'media') return 1
  if (urgencia === 'baja') return 2
  return 3
}

export function parsePrioridadUrgencia(value: unknown): PrioridadUrgencia | null {
  if (value === 'alta' || value === 'media' || value === 'baja') return value
  return null
}

export function compareAgendaByUrgenciaThenFecha(
  urgenciaA: PrioridadUrgencia | null | undefined,
  fechaMsA: number,
  urgenciaB: PrioridadUrgencia | null | undefined,
  fechaMsB: number,
): number {
  const ra = urgenciaSortRank(urgenciaA)
  const rb = urgenciaSortRank(urgenciaB)
  if (ra !== rb) return ra - rb
  return fechaMsA - fechaMsB
}
