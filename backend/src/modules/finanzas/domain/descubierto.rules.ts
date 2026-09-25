import type { TipoCuenta } from './cuenta.types.js'

/**
 * TECH DEBT (post–Fase 1): umbrales fijos a nivel producto.
 * Objetivo acordado: hacerlos configurables por banco desde Administración
 * (p. ej. global_settings o doc por banco), inyectados en computeDescubiertoEstado.
 * No mover la lógica a la UI ni a rutas Express.
 */
export const DESCUBIERTO_UMBRAL_VERDE_HASTA_PORCENTAJE = 60
export const DESCUBIERTO_UMBRAL_AMARILLO_HASTA_PORCENTAJE = 90

export type SemaforoDescubierto = 'verde' | 'amarillo' | 'rojo'

export interface DescubiertoEstado {
  porcentajeUsado: number | null
  semaforo: SemaforoDescubierto | null
  /** null si no hay límite de descubierto cargado (no evaluable). */
  superado: boolean | null
}

/**
 * Porcentaje del descubierto consumido y semáforo operativo.
 * Umbrales: verde 0–60 %, amarillo 60–90 %, rojo > 90 % o límite superado.
 */
export function computeDescubiertoEstado(
  saldoActualCentavos: number,
  descubiertoCentavos: number | null,
  tipo: TipoCuenta,
): DescubiertoEstado {
  if (tipo !== 'CC' || descubiertoCentavos == null || descubiertoCentavos <= 0) {
    return { porcentajeUsado: null, semaforo: null, superado: null }
  }

  if (saldoActualCentavos >= 0) {
    return { porcentajeUsado: 0, semaforo: 'verde', superado: false }
  }

  const usadoCentavos = Math.abs(saldoActualCentavos)
  const superado = usadoCentavos > descubiertoCentavos
  const porcentajeUsado = Math.round((usadoCentavos / descubiertoCentavos) * 100)

  let semaforo: SemaforoDescubierto
  if (superado || porcentajeUsado > DESCUBIERTO_UMBRAL_AMARILLO_HASTA_PORCENTAJE) {
    semaforo = 'rojo'
  } else if (porcentajeUsado > DESCUBIERTO_UMBRAL_VERDE_HASTA_PORCENTAJE) {
    semaforo = 'amarillo'
  } else {
    semaforo = 'verde'
  }

  return { porcentajeUsado, semaforo, superado }
}
