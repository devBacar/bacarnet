/**
 * Feriados que se trabajan con pago doble (LCT art. 166) para proyectar los meses que todavía no se liquidaron.
 * Los meses pasados no usan esta lista: salen del concepto FERIAD de Salario.
 *
 * Incluye nacionales y los provinciales de Córdoba. No incluye días no laborables (son optativos para el sector privado).
 * Actualizar cada año con el decreto de feriados (los trasladables cambian de fecha).
 */
export const FERIADOS: Record<string, string> = {
  '2026-10-12': 'Diversidad Cultural',
  // DNU 1103/2026: el 9/11 es feriado nacional y el 10/11 solo en Córdoba y CABA.
  '2026-11-09': 'Visita del Papa',
  '2026-11-10': 'Visita del Papa (Córdoba)',
  '2026-11-23': 'Soberanía Nacional',
  '2026-12-08': 'Inmaculada Concepción',
  '2026-12-25': 'Navidad',
  '2027-01-01': 'Año Nuevo',
  '2027-02-08': 'Carnaval',
  '2027-02-09': 'Carnaval',
  '2027-03-24': 'Día de la Memoria',
  '2027-03-26': 'Viernes Santo',
  '2027-04-02': 'Malvinas',
  '2027-05-01': 'Día del Trabajador',
  '2027-05-25': 'Revolución de Mayo',
  '2027-06-21': 'Güemes (trasladable)',
  '2027-06-20': 'Día de la Bandera',
  '2027-07-09': 'Independencia',
  '2027-08-16': 'San Martín (trasladable)',
  '2027-10-11': 'Diversidad Cultural (trasladable)',
  '2027-11-20': 'Soberanía Nacional',
  '2027-12-08': 'Inmaculada Concepción',
  '2027-12-25': 'Navidad',
}

/** Feriados de un mes AAAAMM: cantidad y detalle legible ("9/11 Visita del Papa…"). */
export function feriadosDelMes(mes: string): { cantidad: number; detalle: string[]; enCalendario: boolean } {
  const prefijo = `${mes.slice(0, 4)}-${mes.slice(4, 6)}-`
  const detalle = Object.entries(FERIADOS)
    .filter(([fecha]) => fecha.startsWith(prefijo))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([fecha, nombre]) => `${Number(fecha.slice(8, 10))}/${Number(fecha.slice(5, 7))} ${nombre}`)
  const anios = new Set(Object.keys(FERIADOS).map((f) => f.slice(0, 4)))
  return { cantidad: detalle.length, detalle, enCalendario: anios.has(mes.slice(0, 4)) }
}
