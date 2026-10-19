/** Filtro de la Agenda por plazo: lo atrasado y lo de la semana, todo junto. */
export type PlazoAgenda = 'semana' | 'atrasados' | 'hoy' | 'proximos' | 'sinFecha' | 'todos'

export const PLAZOS: Array<{ id: PlazoAgenda; label: string }> = [
  { id: 'semana', label: 'Atrasados + próximos 7 días' },
  { id: 'atrasados', label: 'Atrasados' },
  { id: 'hoy', label: 'Hoy' },
  { id: 'proximos', label: 'Próximos 7 días' },
  { id: 'sinFecha', label: 'Sin fecha de pago' },
  { id: 'todos', label: 'Todos' },
]

/** AAAA-MM-DD en Argentina. */
export function diaArgentina(fecha: Date | string): string {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function sumarDias(ymd: string, dias: number): string {
  const [a, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

export function enPlazo(
  fechaIso: string | null | undefined,
  plazo: PlazoAgenda,
  hoy: string,
  sinFecha = false,
): boolean {
  if (plazo === 'todos') return true
  if (plazo === 'sinFecha') return sinFecha
  if (sinFecha) return false
  if (!fechaIso) return plazo === 'atrasados' || plazo === 'semana'
  const dia = diaArgentina(fechaIso)
  const limite = sumarDias(hoy, 7)
  switch (plazo) {
    case 'atrasados':
      return dia < hoy
    case 'hoy':
      return dia === hoy
    case 'proximos':
      return dia > hoy && dia <= limite
    case 'semana':
      return dia <= limite
  }
}

/** Factura de Vientri sin vencimiento y sin fecha puesta por Finanzas. */
export function esSinFecha(row: {
  vientri?: { sinFechaDePago?: boolean; fechaEstimada?: boolean; fechaVencimiento: string } | null
  fecha: string | null | undefined
}): boolean {
  return row.vientri?.sinFechaDePago === true && row.vientri.fechaEstimada !== true && !!row.fecha && diaArgentina(row.fecha) === row.vientri.fechaVencimiento
}

/** Fecha calculada con lo que tarda esa persona en pagar o cobrar (y que Finanzas no cambió). */
export function esFechaEstimada(row: {
  vientri?: { fechaEstimada?: boolean; fechaVencimiento: string } | null
  fecha: string | null | undefined
}): boolean {
  return row.vientri?.fechaEstimada === true && !!row.fecha && diaArgentina(row.fecha) === row.vientri.fechaVencimiento
}
