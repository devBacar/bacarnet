/**
 * Cuando un doc ya existe, la importación solo actualiza los campos "vivos" (los que Vientri cambia con
 * el tiempo, como `pagado` o `estado`) y deja el resto como está. Devuelve solo los campos que cambiaron,
 * o `null` si no hay nada para escribir.
 */
export function camposVivosCambiados(
  previo: Record<string, unknown>,
  nuevo: Record<string, unknown>,
  campos: readonly string[],
): Record<string, unknown> | null {
  const cambios: Record<string, unknown> = {}
  for (const campo of campos) {
    if (!(campo in nuevo)) continue
    if (JSON.stringify(previo[campo] ?? null) !== JSON.stringify(nuevo[campo] ?? null)) {
      cambios[campo] = nuevo[campo]
    }
  }
  return Object.keys(cambios).length > 0 ? cambios : null
}
