import { useQuery } from '@tanstack/react-query'
import { montoCorto } from '../hoy/montoCorto'
import { fetchCargaDiaria, type CargaDiaria, type DiaCarga, type NivelCarga } from '../../../services/finanzasCargaDiariaApi'

export const DIAS_ASISTENTE = 30

export const NIVEL_TEXTO: Record<NivelCarga, string> = {
  liviano: 'Día liviano',
  medio: 'Día medio',
  pesado: 'Día pesado',
  sin_pagos: 'Sin pagos',
}

/** Clases de color por nivel (verde / ámbar / rojo, con modo oscuro). */
export const NIVEL_CLASES: Record<NivelCarga, string> = {
  liviano: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200',
  medio: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
  pesado: 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200',
  sin_pagos: 'border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-400',
}

export const EXPLICACION_CARGA = [
  'Se suma todo lo que vence cada día en la Agenda: facturas, cheques ya emitidos, cuotas de inversores y lo cargado a mano. Los dólares se pasan a pesos con el tipo de cambio del mes.',
  'El promedio es lo que vence en el mes dividido la cantidad de días hábiles de ese mes (sábados, domingos y feriados no cuentan).',
  'Liviano: el día vence hasta el 60 % del promedio. Medio: entre el 60 % y el 140 %. Pesado: más del 140 %. Un día sin vencimientos es liviano de verdad, pero se marca "Sin pagos".',
  'Lo que vence en sábado, domingo o feriado se cuenta en el día hábil anterior, igual que en Compromisos de la semana.',
]

export function fechaCorta(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
export function diaSemana(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]
}

export function useCargaDiaria(dias = DIAS_ASISTENTE) {
  return useQuery<CargaDiaria>({
    queryKey: ['finanzas', 'carga-diaria', dias],
    queryFn: () => fetchCargaDiaria({ dias }),
    staleTime: 60_000,
  })
}

export function buscarDia(carga: CargaDiaria | undefined, fecha: string): DiaCarga | null {
  return carga?.dias.find((dia) => dia.fecha === fecha) ?? null
}

export { montoCorto }
