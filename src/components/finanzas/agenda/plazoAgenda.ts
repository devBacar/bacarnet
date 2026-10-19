/** Filtro de la Agenda por plazo: lo atrasado y lo de la semana, todo junto. */
export type PlazoAgenda = 'semana' | 'atrasados' | 'hoy' | 'proximos' | 'todos'

export const PLAZOS: Array<{ id: PlazoAgenda; label: string }> = [
  { id: 'semana', label: 'Atrasados + próximos 7 días' },
  { id: 'atrasados', label: 'Atrasados' },
  { id: 'hoy', label: 'Hoy' },
  { id: 'proximos', label: 'Próximos 7 días' },
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

export function enPlazo(fechaIso: string | null | undefined, plazo: PlazoAgenda, hoy: string): boolean {
  if (plazo === 'todos') return true
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

