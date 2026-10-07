/**
 * Reglas de los convenios colectivos que usa el informe de RRHH.
 * Fuentes: CCT 422/05 (SUVICO Córdoba, Res. 373/2005), CCT 40/89 (Camioneros), CCT 18/75 (Bancarios),
 * CCT 130/75 (Comercio), LCT, Decreto 484/2000 y Ley 27.802 (BO 06/03/2026).
 */

export type Convenio = 'suvico' | 'camioneros' | 'bancarios' | 'comercio' | 'fuera'

export interface ReglasConvenio {
  nombre: string
  /** Horas de una jornada mensual completa, para pasar horas extra a "puestos". */
  horasMes: number
  /** Texto de la regla de jornada y horas extra. */
  jornada: string
  /** Por qué se paga al 100%, en palabras de la persona que lee el informe. */
  recargo100: string
  /** Regla de vacaciones específica del convenio, si la hay. */
  vacaciones?: string
  /**
   * Período que cubre la liquidación de un mes: 'ciclo26' = del 26 del mes anterior al 25 del mes
   * (verificado en Salario: las licencias del 26 a fin de mes caen en la liquidación siguiente);
   * 'calendario' = del 1 al último día del mes.
   */
  corte: 'ciclo26' | 'calendario'
}

export const CONVENIOS: Record<Convenio, ReglasConvenio> = {
  suvico: {
    nombre: 'CCT 422/05 (SUVICO Córdoba)',
    horasMes: 204,
    jornada: 'CCT 422/05 art. 9: jornada de 8 h diarias y 48 semanales; base de 204 h mensuales.',
    recargo100: 'trabajo en sábado después de las 13 h, domingo o feriado',
    vacaciones: 'CCT 422/05 art. 21 c: verano (21/12 al 20/3) obligatorio uno de cada dos años.',
    corte: 'ciclo26',
  },
  camioneros: {
    nombre: 'CCT 40/89 (Camioneros)',
    horasMes: Math.round((44 * 52) / 12),
    jornada: 'CCT 40/89 ítem 4.1.1: jornada de 44 h semanales.',
    recargo100: 'trabajo después de las 21 h, antes de las 6 h, sábado después de las 13 h o domingo (CCT 40/89 ítems 4.1.3 y 4.1.5)',
    corte: 'ciclo26',
  },
  bancarios: {
    nombre: 'CCT 18/75 (Bancarios)',
    horasMes: Math.round((7.5 * 5 * 52) / 12),
    jornada: 'CCT 18/75: jornada de 7 h 30 min de lunes a viernes.',
    recargo100: 'trabajo en sábado después de las 13 h, domingo o feriado',
    vacaciones: 'CCT 18/75: vacaciones en días hábiles; se pueden fraccionar de común acuerdo.',
    corte: 'calendario',
  },
  comercio: {
    nombre: 'CCT 130/75 (Comercio)',
    horasMes: Math.round((48 * 52) / 12),
    jornada: 'CCT 130/75: 48 h semanales.',
    recargo100: 'trabajo en sábado después de las 13 h, domingo o feriado',
    corte: 'calendario',
  },
  fuera: {
    nombre: 'Fuera de convenio',
    horasMes: 200,
    jornada: 'LCT: 48 h semanales.',
    recargo100: 'trabajo en sábado después de las 13 h, domingo o feriado',
    corte: 'calendario',
  },
}

/** Normas generales que se citan en las recomendaciones. */
export const NORMAS = {
  limiteHorasExtra: 'Decreto 484/2000: máximo 30 h extra por mes y 200 h por año.',
  feriadoDoble: 'LCT art. 166: el feriado trabajado se paga doble.',
  vacacionesAviso: 'LCT art. 154 (Ley 27.802): aviso con 30 días; se pueden fraccionar en tramos de 7 días o más.',
  bancoDeHoras:
    'LCT art. 197 bis (Ley 27.802): compensación con francos por acuerdo escrito y voluntario, con límites y registro compartido; respetar 12 h entre jornadas y 35 h de descanso semanal.',
  derechoVacaciones: 'LCT art. 150: 14, 21, 28 o 35 días según antigüedad.',
} as const

/** Límite anual y mensual de horas extra (Decreto 484/2000), sin contar feriados. */
export const LIMITE_HE_ANUAL = 200
export const LIMITE_HE_MENSUAL = 30

/** Cargas sociales patronales promedio (las contribuciones de Salario rondan el 27% del remunerativo). */
export const CARGAS_SOCIALES = 1.27
/** Aguinaldo: 1/12 adicional. */
export const AGUINALDO = 1.0833

/** Convenio de un esquema de liquidación de Salario, por su nombre (tabla de códigos COTAB 17). */
export function convenioDeEsquema(nombreEsquema: string | undefined): Convenio {
  const n = (nombreEsquema ?? '').toLowerCase()
  if (n.includes('suvico')) return 'suvico'
  if (n.includes('camion')) return 'camioneros'
  if (n.includes('bancar')) return 'bancarios'
  if (n.includes('comercio')) return 'comercio'
  return 'fuera'
}

/** Días de vacaciones según antigüedad al 31/12 del año de vacaciones (LCT art. 150 y 153). */
export function diasVacacionesLct(fechaIngreso: string | null, anioVacaciones: number): number {
  if (!fechaIngreso) return 14
  const fin = Date.UTC(anioVacaciones, 11, 31)
  const ingreso = Date.parse(`${fechaIngreso}T00:00:00Z`)
  if (Number.isNaN(ingreso)) return 14
  const dias = (fin - ingreso) / 86_400_000
  if (dias < 0) return 0
  const anios = dias / 365.25
  if (anios < 0.5) return Math.max(0, Math.round(dias / 20))
  if (anios <= 5) return 14
  if (anios <= 10) return 21
  if (anios <= 20) return 28
  return 35
}

/** Días que cubre la liquidación del mes AAAAMM para el convenio (fechas AAAA-MM-DD, inclusive). */
export function ventanaLiquidacion(mes: string, convenio: Convenio): { desde: string; hasta: string } {
  const anio = Number(mes.slice(0, 4))
  const m = Number(mes.slice(4, 6))
  const iso = (a: number, mm: number, d: number) => `${a}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  if (CONVENIOS[convenio].corte === 'ciclo26') {
    return { desde: m === 1 ? iso(anio - 1, 12, 26) : iso(anio, m - 1, 26), hasta: iso(anio, m, 25) }
  }
  const ultimo = new Date(Date.UTC(anio, m, 0)).getUTCDate()
  return { desde: iso(anio, m, 1), hasta: iso(anio, m, ultimo) }
}
