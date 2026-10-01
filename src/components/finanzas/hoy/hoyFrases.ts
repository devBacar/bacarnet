import type { HoyResponse } from '../../../services/finanzasHoyApi'

/** Funciones puras de la pantalla Hoy: sin React, para que Fast Refresh no se queje. */

const ZONA = 'America/Argentina/Buenos_Aires'

/** "miércoles 30 de septiembre" a partir de la fecha YYYY-MM-DD que manda el backend. */
export function fechaLarga(ymd: string): string {
  const partes = new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).formatToParts(new Date(`${ymd}T12:00:00-03:00`))
  const parte = (type: 'weekday' | 'day' | 'month') => partes.find((p) => p.type === type)?.value ?? ''
  return `${parte('weekday')} ${parte('day')} de ${parte('month')}`
}

/** "Mié" a partir de YYYY-MM-DD. */
export function diaCorto(ymd: string): string {
  const texto = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, weekday: 'short' })
    .format(new Date(`${ymd}T12:00:00-03:00`))
    .replace('.', '')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** "miércoles" a partir de YYYY-MM-DD. */
export function nombreDia(ymd: string): string {
  return new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, weekday: 'long' }).format(new Date(`${ymd}T12:00:00-03:00`))
}

export interface SugerenciaHoy {
  texto: string
  tono: 'ok' | 'aviso'
}

/** Desde qué banco conviene pagar lo de hoy, en una frase corta. */
export function sugerenciaDesdeDondePagar(dia: HoyResponse['dia']): SugerenciaHoy | null {
  if (dia.pagosCentavos <= 0 || dia.bancos.length === 0) return null
  const ordenados = [...dia.bancos].sort((a, b) => b.quedaParaUsarCentavos - a.quedaParaUsarCentavos)
  const mejor = ordenados[0]!
  if (mejor.quedaParaUsarCentavos >= dia.pagosCentavos) {
    return { tono: 'ok', texto: `Conviene pagar desde ${mejor.bancoNombre}.` }
  }
  return {
    tono: 'aviso',
    texto: `Ningún banco cubre solo lo de hoy. El que más margen tiene es ${mejor.bancoNombre}.`,
  }
}
