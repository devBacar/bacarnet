/** "1500000.5" (pesos, como lo manda un input numérico) → 150000050 centavos. Vacío → null. */
export function pesosACentavos(raw: string | undefined | null): number | null {
  const limpio = raw?.trim()
  if (!limpio) return null
  const pesos = Number(limpio)
  if (!Number.isFinite(pesos) || pesos < 0) throw new Error('El monto tiene que ser un número mayor o igual a 0')
  return Math.round(pesos * 100)
}

export function leerRangoMonto(
  desde: string | undefined | null,
  hasta: string | undefined | null,
): { montoMinCentavos: number | null; montoMaxCentavos: number | null } {
  const montoMinCentavos = pesosACentavos(desde)
  const montoMaxCentavos = pesosACentavos(hasta)
  if (montoMinCentavos != null && montoMaxCentavos != null && montoMinCentavos > montoMaxCentavos) {
    throw new Error('"Monto desde" no puede ser mayor que "Monto hasta"')
  }
  return { montoMinCentavos, montoMaxCentavos }
}

export function dentroDelRangoMonto(
  montoCentavos: unknown,
  rango: { montoMinCentavos?: number | null; montoMaxCentavos?: number | null },
): boolean {
  const { montoMinCentavos, montoMaxCentavos } = rango
  if (montoMinCentavos == null && montoMaxCentavos == null) return true
  if (typeof montoCentavos !== 'number' || !Number.isFinite(montoCentavos)) return false
  if (montoMinCentavos != null && montoCentavos < montoMinCentavos) return false
  if (montoMaxCentavos != null && montoCentavos > montoMaxCentavos) return false
  return true
}
