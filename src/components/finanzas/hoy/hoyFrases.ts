import type { BancoHoy, HoyResponse } from '../../../services/finanzasHoyApi'
import { estadoDescubierto, montoSimpleAbs } from '../montoSimple'

/** Funciones puras de la pantalla Hoy: sin React, para que Fast Refresh no se queje. */

export function hayBancoPasado(bancos: BancoHoy[]): boolean {
  return bancos.some(
    (banco) => estadoDescubierto(banco.saldoAhoraCentavos, banco.descubiertoCentavos).clave === 'pasado',
  )
}

/** Desde qué banco conviene pagar, en una frase. Usa el aviso del backend si lo hay. */
export function sugerenciaDesdeDondePagar(dia: HoyResponse['dia']): string | null {
  if (dia.avisoDescubierto) return dia.avisoDescubierto
  if (dia.pagosCentavos <= 0 || dia.bancos.length === 0) return null
  const mejor = [...dia.bancos].sort((a, b) => b.quedaParaUsarCentavos - a.quedaParaUsarCentavos)[0]!
  if (mejor.quedaParaUsarCentavos < dia.pagosCentavos) return null
  const margen = mejor.quedaParaUsarCentavos - dia.pagosCentavos
  return `Podés pagar todo lo de hoy desde ${mejor.bancoNombre}: después le quedan ${montoSimpleAbs(margen)} para usar.`
}

export function plural(cantidad: number, singular: string, pluralTexto: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`
}
