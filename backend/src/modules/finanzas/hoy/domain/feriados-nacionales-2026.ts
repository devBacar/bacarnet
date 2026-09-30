/**
 * Feriados nacionales de Argentina en 2026.
 * Inamovibles y trasladables (ley 27.399): Güemes al lunes 15/6 y Soberanía al lunes 23/11.
 * Carnaval y Viernes Santo según Pascua (5 de abril de 2026).
 * El 20/6 cae sábado: queda en la columna Finde, no como feriado suelto.
 * No incluye puentes que se decretan aparte.
 */
export const FERIADOS_NACIONALES_2026 = [
  '2026-01-01',
  '2026-02-16',
  '2026-02-17',
  '2026-03-24',
  '2026-04-02',
  '2026-04-03',
  '2026-05-01',
  '2026-05-25',
  '2026-06-15',
  '2026-06-20',
  '2026-07-09',
  '2026-08-17',
  '2026-10-12',
  '2026-11-23',
  '2026-12-08',
  '2026-12-25',
] as const

export function feriadosNacionales2026(): ReadonlySet<string> {
  return new Set(FERIADOS_NACIONALES_2026)
}
