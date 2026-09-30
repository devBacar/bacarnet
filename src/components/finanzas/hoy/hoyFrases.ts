import type { BancoHoy, HoyResponse } from '../../../services/finanzasHoyApi'
import { estadoDescubierto } from '../estadoDescubierto'
import { formatMoneyCentavos } from '../formatMoney'

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

export function hayBancoPasado(bancos: BancoHoy[]): boolean {
  return bancos.some(
    (banco) => estadoDescubierto(banco.saldoAhoraCentavos, banco.descubiertoCentavos).clave === 'pasado',
  )
}

export interface SugerenciaHoy {
  texto: string
  tono: 'ok' | 'aviso'
}

/**
 * Desde qué banco conviene pagar lo de hoy, en una frase con el monto completo.
 * Se calcula acá (y no con `dia.avisoDescubierto`) para mostrar los montos como en la planilla.
 */
export function sugerenciaDesdeDondePagar(dia: HoyResponse['dia']): SugerenciaHoy | null {
  if (dia.pagosCentavos <= 0 || dia.bancos.length === 0) return null
  const ordenados = [...dia.bancos].sort((a, b) => b.quedaParaUsarCentavos - a.quedaParaUsarCentavos)
  const mejor = ordenados[0]!
  if (mejor.quedaParaUsarCentavos >= dia.pagosCentavos) {
    return {
      tono: 'ok',
      texto: `Conviene pagar desde ${mejor.bancoNombre}: tiene ${formatMoneyCentavos(mejor.quedaParaUsarCentavos, 'ARS')} para usar.`,
    }
  }
  const falta = dia.pagosCentavos - mejor.quedaParaUsarCentavos
  return {
    tono: 'aviso',
    texto: `Ningún banco cubre solo lo de hoy. El que más margen tiene es ${mejor.bancoNombre}, con ${formatMoneyCentavos(mejor.quedaParaUsarCentavos, 'ARS')}: faltan ${formatMoneyCentavos(falta, 'ARS')}.`,
  }
}

export function plural(cantidad: number, singular: string, pluralTexto: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`
}
