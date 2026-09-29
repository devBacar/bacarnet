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

/** Tope de cordura para la carga manual: $ 1 billón. */
export const DESCUBIERTO_MAXIMO_CENTAVOS = 100_000_000_000_000

export interface DescubiertoManualInput {
  /** null o 0 = la cuenta no tiene acuerdo de descubierto. */
  descubiertoCentavos: number | null
  /** Fecha del acuerdo en Argentina (YYYY-MM-DD); opcional. */
  vigenteDesde: string | null
}

/**
 * Valida la carga manual del acuerdo de descubierto de una cuenta corriente.
 * Interbanking no informa el límite: lo carga el líder de Finanzas o un super admin.
 */
export function parseDescubiertoManual(
  input: { descubiertoCentavos?: unknown; vigenteDesde?: unknown },
  hoy: Date = new Date(),
): { descubiertoCentavos: number | null; vigenteDesde: Date | null } {
  const raw = input.descubiertoCentavos
  if (raw !== null && (typeof raw !== 'number' || !Number.isFinite(raw))) {
    throw new Error('descubiertoCentavos debe ser un número en centavos o null')
  }
  if (raw != null && raw < 0) {
    throw new Error('El descubierto se carga como monto positivo (el límite acordado)')
  }
  if (raw != null && raw > DESCUBIERTO_MAXIMO_CENTAVOS) {
    throw new Error('El descubierto supera el máximo permitido')
  }
  const descubiertoCentavos = raw == null || Math.round(raw) === 0 ? null : Math.round(raw)
  if (descubiertoCentavos == null) return { descubiertoCentavos: null, vigenteDesde: null }

  const fecha = input.vigenteDesde
  if (fecha == null || fecha === '') return { descubiertoCentavos, vigenteDesde: null }
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error('vigenteDesde debe tener formato AAAA-MM-DD')
  }
  const vigenteDesde = new Date(`${fecha}T00:00:00-03:00`)
  if (Number.isNaN(vigenteDesde.getTime()) || vigenteDesde.toISOString().slice(0, 10) !== fecha) {
    throw new Error('vigenteDesde no es una fecha válida')
  }
  if (vigenteDesde.getTime() > hoy.getTime()) {
    throw new Error('La fecha del acuerdo no puede ser futura')
  }
  return { descubiertoCentavos, vigenteDesde }
}
