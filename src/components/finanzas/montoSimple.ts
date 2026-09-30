/**
 * Montos y frases para leer en voz alta, pensados para quien viene de una planilla básica.
 * Funciones puras: sin React, sin fetch. Todo en centavos de pesos.
 *
 * - Desde el millón: una cifra decimal ($593,6 millones, $100 millones, $1 millón).
 * - Debajo del millón: el peso completo ($51.584; con centavos solo si los hay).
 * - Negativos con el signo menos tipográfico: −$593,6 millones.
 */

const UN_MILLON_EN_PESOS = 1_000_000
const SIGNO_MENOS = '\u2212'

const formatoMillones = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })
const formatoPesosEnteros = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const formatoPesosConCentavos = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** El monto sin signo: $593,6 millones, $1 millón o $51.584. */
export function montoSimpleAbs(centavos: number): string {
  const centavosAbs = Math.abs(Math.round(centavos))
  const pesos = centavosAbs / 100
  if (pesos >= UN_MILLON_EN_PESOS) {
    const millones = formatoMillones.format(pesos / UN_MILLON_EN_PESOS)
    return millones === '1' ? '$1 millón' : `$${millones} millones`
  }
  // Desde $1.000 se redondea al peso para leer rápido ($51.584); abajo se muestran los centavos.
  const tieneCentavos = centavosAbs % 100 !== 0 && pesos < 1000
  const texto = tieneCentavos ? formatoPesosConCentavos.format(pesos) : formatoPesosEnteros.format(pesos)
  return `$${texto}`
}

/** El monto con signo cuando es negativo: −$593,6 millones. */
export function montoSimple(centavos: number): string {
  const texto = montoSimpleAbs(centavos)
  return centavos < 0 ? `${SIGNO_MENOS}${texto}` : texto
}

export type TonoEstado = 'verde' | 'ambar' | 'rojo'

export type ClaveEstadoDescubierto =
  | 'a_favor'
  | 'con_margen'
  | 'queda_poco'
  | 'al_limite'
  | 'pasado'
  | 'sin_descubierto'

export interface EstadoDescubierto {
  clave: ClaveEstadoDescubierto
  /** Texto del chip: A favor, Con margen, Queda poco, Al límite, Pasado del límite… */
  etiqueta: string
  tono: TonoEstado
  /** Descubierto acordado que vale (positivo) o null si no hay uno cargado. */
  descubiertoCentavos: number | null
  /** 0 a 100 de lo que se está usando del descubierto; null si no hay descubierto o está a favor. */
  porcentajeUso: number | null
  /** Cuánto se pasó del descubierto; 0 si no se pasó. */
  excesoCentavos: number
  /** Lo que queda para usar: saldo más descubierto (nunca negativo). */
  margenCentavos: number
}

const LIMITE_VERDE = 60
const LIMITE_AMBAR = 90

function descubiertoQueVale(descubiertoCentavos: number | null | undefined): number | null {
  return descubiertoCentavos != null && descubiertoCentavos > 0 ? descubiertoCentavos : null
}

export function estadoDescubierto(
  saldoCentavos: number,
  descubiertoCentavos: number | null | undefined,
): EstadoDescubierto {
  const descubierto = descubiertoQueVale(descubiertoCentavos)
  const margenCentavos = Math.max(0, saldoCentavos + (descubierto ?? 0))

  if (saldoCentavos >= 0) {
    return {
      clave: 'a_favor',
      etiqueta: 'A favor',
      tono: 'verde',
      descubiertoCentavos: descubierto,
      porcentajeUso: null,
      excesoCentavos: 0,
      margenCentavos,
    }
  }

  if (descubierto == null) {
    return {
      clave: 'sin_descubierto',
      etiqueta: 'En rojo, sin descubierto cargado',
      tono: 'ambar',
      descubiertoCentavos: null,
      porcentajeUso: null,
      excesoCentavos: 0,
      margenCentavos: 0,
    }
  }

  const usado = -saldoCentavos
  const porcentajeUso = Math.min(100, (usado / descubierto) * 100)
  const excesoCentavos = Math.max(0, usado - descubierto)
  const comun = { descubiertoCentavos: descubierto, porcentajeUso, excesoCentavos, margenCentavos }

  if (excesoCentavos > 0) {
    return { clave: 'pasado', etiqueta: 'Pasado del límite', tono: 'rojo', ...comun }
  }
  if (porcentajeUso > LIMITE_AMBAR) {
    return { clave: 'al_limite', etiqueta: 'Al límite', tono: 'rojo', ...comun }
  }
  if (porcentajeUso > LIMITE_VERDE) {
    return { clave: 'queda_poco', etiqueta: 'Queda poco', tono: 'ambar', ...comun }
  }
  return { clave: 'con_margen', etiqueta: 'Con margen', tono: 'verde', ...comun }
}

/** Las frases clave de la tarjeta de un banco, en orden. Siempre al menos una. */
export function frasesDescubierto(
  saldoCentavos: number,
  descubiertoCentavos: number | null | undefined,
): string[] {
  const estado = estadoDescubierto(saldoCentavos, descubiertoCentavos)
  const descubierto = estado.descubiertoCentavos

  if (estado.clave === 'a_favor') {
    const frases = [
      saldoCentavos === 0 ? 'Está justo en cero, sin deuda.' : `Tiene ${montoSimpleAbs(saldoCentavos)} a favor.`,
    ]
    if (descubierto != null) {
      frases.push(`Además tiene ${montoSimpleAbs(descubierto)} de descubierto sin usar.`)
    }
    return frases
  }

  if (estado.clave === 'sin_descubierto' || descubierto == null) {
    return ['Está en rojo y no hay descubierto cargado. Si el banco le dio uno, cargalo.']
  }

  if (estado.clave === 'pasado') {
    return [
      `Tiene ${montoSimpleAbs(descubierto)} de descubierto y ya lo pasó por ${montoSimpleAbs(estado.excesoCentavos)}.`,
    ]
  }

  const quedan =
    estado.margenCentavos > 0
      ? `Le quedan ${montoSimpleAbs(estado.margenCentavos)} para usar.`
      : 'No le queda nada para usar.'
  return [
    `Está usando ${montoSimpleAbs(-saldoCentavos)} de sus ${montoSimpleAbs(descubierto)} de descubierto. ${quedan}`,
  ]
}

/** Frase para el saldo después de lo de hoy, cuando se conoce. */
export function fraseSaldoDespues(saldoDespuesCentavos: number): string {
  return `Si pagás lo de hoy desde acá, queda en ${montoSimple(saldoDespuesCentavos)}.`
}

export interface BancoParaResumen {
  banco: string
  saldoCentavos: number
  descubiertoCentavos: number | null
}

function unirEnCastellano(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/**
 * El resumen arriba de las tarjetas, en frases cortas. No mezcla bancos en un único disponible:
 * dice cuánto queda en cada uno y cuál está pasado.
 */
export function resumenBancos(bancos: BancoParaResumen[]): string[] {
  if (bancos.length === 0) return []
  const frases: string[] = []
  const total = bancos.reduce((suma, banco) => suma + banco.saldoCentavos, 0)
  frases.push(
    bancos.length === 1
      ? `En ${bancos[0]!.banco} estás en ${montoSimple(total)}.`
      : `Entre los ${bancos.length} bancos estás en ${montoSimple(total)}.`,
  )

  const estados = bancos.map((banco) => ({
    banco: banco.banco,
    estado: estadoDescubierto(banco.saldoCentavos, banco.descubiertoCentavos),
  }))

  const conMargen = estados
    .filter((item) => item.estado.margenCentavos > 0)
    .sort((a, b) => b.estado.margenCentavos - a.estado.margenCentavos)
  if (conMargen.length === 0) {
    frases.push('No te queda margen para usar en ningún banco.')
  } else if (conMargen.length === 1) {
    const unico = conMargen[0]!
    frases.push(`Te quedan ${montoSimpleAbs(unico.estado.margenCentavos)} para usar en ${unico.banco}.`)
  } else {
    const suma = conMargen.reduce((acc, item) => acc + item.estado.margenCentavos, 0)
    const detalle = unirEnCastellano(
      conMargen.map((item) => `${montoSimpleAbs(item.estado.margenCentavos)} en ${item.banco}`),
    )
    frases.push(`Te quedan ${montoSimpleAbs(suma)} para usar: ${detalle}.`)
  }

  for (const item of estados) {
    if (item.estado.clave === 'pasado') {
      frases.push(`${item.banco} está pasado ${montoSimpleAbs(item.estado.excesoCentavos)} de su descubierto.`)
    } else if (item.estado.clave === 'sin_descubierto') {
      frases.push(`${item.banco} está en rojo y no tiene descubierto cargado.`)
    }
  }
  return frases
}
