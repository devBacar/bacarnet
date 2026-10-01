/** Pesos con formato es-AR: 1.234,56 o 1234,56. Devuelve centavos enteros. */
export function parseMontoEsArACentavos(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, '').replace(/^\$/, '')
  if (!trimmed) return null
  const conMiles = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/
  const simple = /^\d+(,\d{1,2})?$/
  if (!conMiles.test(trimmed) && !simple.test(trimmed)) return null
  const normalized = trimmed.replace(/\./g, '').replace(',', '.')
  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) return null
  const centavos = Math.round(value * 100)
  if (centavos <= 0) return null
  return centavos
}
