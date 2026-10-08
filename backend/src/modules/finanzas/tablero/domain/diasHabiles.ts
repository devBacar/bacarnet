import { armarCalendario } from '../../../rrhh/domain/calendarioFeriados.js'

const feriadosPorAnio = new Map<number, Set<string>>()

function feriadosDe(anio: number): Set<string> {
  const previo = feriadosPorAnio.get(anio)
  if (previo) return previo
  const cal = armarCalendario([anio])
  const set = new Set(Object.keys(cal.anios[String(anio)] ?? {}))
  feriadosPorAnio.set(anio, set)
  return set
}

export function sumarDiasCalendario(ymd: string, dias: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)
}

export function esFinDeSemana(ymd: string): boolean {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay()
  return dow === 0 || dow === 6
}

/**
 * Día hábil según el calendario de feriados (armarCalendario):
 * no es sábado, domingo ni feriado. No cambia el calendario de RRHH.
 */
export function esDiaHabil(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false
  if (esFinDeSemana(ymd)) return false
  return !feriadosDe(Number(ymd.slice(0, 4))).has(ymd)
}

/** La misma fecha si es hábil; si no, el hábil que sigue. */
export function habilEnODespues(ymd: string): string {
  let cursor = ymd
  for (let i = 0; i < 21; i += 1) {
    if (esDiaHabil(cursor)) return cursor
    cursor = sumarDiasCalendario(cursor, 1)
  }
  return cursor
}

/** Primer día hábil estrictamente posterior. Es el clearing de 24 h. */
export function habilSiguiente(ymd: string): string {
  return habilEnODespues(sumarDiasCalendario(ymd, 1))
}

/** Lunes de esa semana. La semana empieza el lunes. */
export function lunesDe(ymd: string): string {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay()
  const delta = dow === 0 ? -6 : 1 - dow
  return sumarDiasCalendario(ymd, delta)
}
