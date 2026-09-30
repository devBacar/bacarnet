const VENTANA_DIAS = 31

export function hoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function sumarDias(fechaId: string, dias: number): string {
  const [year, month, day] = fechaId.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + dias))
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function esFinDeSemana(fechaId: string): boolean {
  const [year, month, day] = fechaId.split('-').map(Number)
  return [0, 6].includes(new Date(Date.UTC(year, month - 1, day)).getUTCDay())
}

export function ultimoDiaHabil(fechaId: string): string {
  let cursor = fechaId
  while (esFinDeSemana(cursor)) cursor = sumarDias(cursor, -1)
  return cursor
}

export function esFechaId(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function moverDiaHabil(fecha: string, delta: -1 | 1, minimo: string, maximo: string): string | null {
  let cursor = sumarDias(fecha, delta)
  while (esFinDeSemana(cursor)) cursor = sumarDias(cursor, delta)
  if (cursor < minimo || cursor > maximo) return null
  return cursor
}

export function tituloDia(fechaId: string): string {
  const [year, month, day] = fechaId.split('-').map(Number)
  const dia = new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(new Date(year, month - 1, day))
  const numero = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
  return `${dia} ${numero}`
}

export function limitesCaja(hoy: string): { minimo: string; maximo: string } {
  return { minimo: sumarDias(hoy, -VENTANA_DIAS), maximo: ultimoDiaHabil(hoy) }
}

export function etiquetaBanco(bancoNombre: string): string {
  if (bancoNombre === 'Córdoba') return 'Bancor'
  return bancoNombre
}
