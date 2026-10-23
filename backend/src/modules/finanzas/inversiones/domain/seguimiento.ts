import { aPagarDeCuota } from './cronograma.js'
import { diasEntre } from './fechas.js'
import type { Cuota, EstadoCuota, EstadoInversion } from './inversion.types.js'

/** Cómo está la cuota en la Agenda (el compromiso que la representa). */
export interface PagoEnAgenda {
  numero: number
  compromisoId: string
  estado: string
  montoCentavos: number
  pagadoCentavos: number
}

export function estadoDeCuota(cuota: Cuota, pago: PagoEnAgenda | undefined, hoy: string): EstadoCuota {
  if (cuota.anulada) return 'anulada'
  const aPagar = aPagarDeCuota(cuota)
  if (aPagar <= 0 && (cuota.renovadaCentavos ?? 0) > 0) return 'renovada'
  if (pago) {
    if (pago.estado === 'pagado' || pago.pagadoCentavos >= pago.montoCentavos) return 'pagada'
    if (cuota.fechaVencimiento < hoy) return 'atrasada'
    if (pago.pagadoCentavos > 0) return 'parcial'
  } else if (cuota.fechaVencimiento < hoy) {
    return 'atrasada'
  }
  return 'pendiente'
}

export interface Alertas {
  porVencer: boolean
  diasParaVencer: number | null
  cuotasAtrasadas: number
  proximaCuota: { numero: number; fecha: string; montoCentavos: number } | null
  fechaFinal: string | null
}

export function alertasDe(input: {
  estado: EstadoInversion
  cronograma: readonly Cuota[]
  estados: ReadonlyMap<number, EstadoCuota>
  hoy: string
  diasAviso: number
}): Alertas {
  const vivas = input.cronograma.filter((c) => !c.anulada)
  const fechaFinal = vivas.at(-1)?.fechaVencimiento ?? null
  if (input.estado !== 'vigente') {
    return { porVencer: false, diasParaVencer: null, cuotasAtrasadas: 0, proximaCuota: null, fechaFinal }
  }
  const abiertas = vivas.filter((c) => {
    const e = input.estados.get(c.numero)
    return e === 'pendiente' || e === 'parcial' || e === 'atrasada'
  })
  const atrasadas = abiertas.filter((c) => input.estados.get(c.numero) === 'atrasada').length
  const proxima = abiertas.find((c) => c.fechaVencimiento >= input.hoy) ?? null
  const diasParaVencer = fechaFinal ? diasEntre(input.hoy, fechaFinal) : null
  return {
    porVencer: diasParaVencer != null && diasParaVencer >= 0 && diasParaVencer <= input.diasAviso,
    diasParaVencer,
    cuotasAtrasadas: atrasadas,
    proximaCuota: proxima
      ? { numero: proxima.numero, fecha: proxima.fechaVencimiento, montoCentavos: aPagarDeCuota(proxima) }
      : null,
    fechaFinal,
  }
}

/** Si una inversión vigente ya no debe nada, en qué estado termina. null = sigue vigente. */
export function estadoAlTerminar(input: {
  estado: EstadoInversion
  cronograma: readonly Cuota[]
  estados: ReadonlyMap<number, EstadoCuota>
}): EstadoInversion | null {
  if (input.estado !== 'vigente') return null
  const vivas = input.cronograma.filter((c) => !c.anulada)
  if (vivas.length === 0) return null
  const terminado = vivas.every((c) => {
    const e = input.estados.get(c.numero)
    return e === 'pagada' || e === 'renovada'
  })
  if (!terminado) return null
  if (vivas.some((c) => (c.renovadaCentavos ?? 0) > 0)) return 'renovada'
  if (vivas.some((c) => c.tipo === 'precancelacion')) return 'precancelada'
  return 'cancelada'
}

export const ESTADO_INVERSION_TEXTO: Record<EstadoInversion, string> = {
  borrador: 'Borrador',
  pendiente_aprobacion: 'Para aprobar',
  vigente: 'Vigente',
  cancelada: 'Terminada',
  precancelada: 'Devuelta antes',
  renovada: 'Renovada',
  anulada: 'Anulada',
}
