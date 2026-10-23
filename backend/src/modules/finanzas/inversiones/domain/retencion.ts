import type { Cuota, RetencionGanancias } from './inversion.types.js'

/**
 * Retención de Ganancias (RG 830) sobre el interés de una cuota. Solo si Finanzas la activó.
 * Base = interés − mínimo no sujeto. Alícuota: inscripto o no inscripto (si no se sabe, no inscripto).
 * Nunca sobre el capital. Bacarnet no trae alícuotas propias: las carga Finanzas en la configuración.
 */
export function retencionDeCuota(cuota: Pick<Cuota, 'interesCentavos'>, rg: RetencionGanancias, inscripto: boolean | null | undefined): number {
  if (!rg.activa || cuota.interesCentavos <= 0) return 0
  const alicuota = inscripto === true ? rg.alicuotaInscriptoPct : rg.alicuotaNoInscriptoPct
  if (!alicuota) return 0
  const base = cuota.interesCentavos - (rg.minimoNoSujetoCentavos ?? 0)
  return base > 0 ? Math.round((base * alicuota) / 100) : 0
}
