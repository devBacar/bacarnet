import { diasDelPeriodo, generarTramo, interesSimple, tasaDelPeriodo, type FuentesTasas } from './cronograma.js'
import { fechaCorta } from './fechas.js'
import { montoTexto } from './textos.js'
import type { CondicionesInversion, Cuota, ModalidadRenovacion, Penalidad } from './inversion.types.js'

/** Lo mínimo de cada cuota que hace falta saber para operar: si ya tiene pagos. */
export interface PagosDeCuota {
  numero: number
  pagadoCentavos: number
}

export interface InversionParaOperar extends CondicionesInversion {
  cronograma: Cuota[]
  indiceAlta: number | null
}

function vivas(cronograma: readonly Cuota[]): Cuota[] {
  return cronograma.filter((c) => !c.anulada)
}

function siguienteNumero(cronograma: readonly Cuota[]): number {
  return cronograma.reduce((max, c) => Math.max(max, c.numero), 0) + 1
}

/** Cuotas que vencen antes de la fecha (quedan como están) y las que vencen ese día o después. */
function partir(cronograma: readonly Cuota[], fecha: string) {
  const antes = vivas(cronograma).filter((c) => c.fechaVencimiento < fecha)
  const desde = vivas(cronograma).filter((c) => c.fechaVencimiento >= fecha)
  return { antes, desde }
}

function verificarSinPagos(cuotas: readonly Cuota[], pagos: readonly PagosDeCuota[]) {
  const conPago = cuotas.find((c) => (pagos.find((p) => p.numero === c.numero)?.pagadoCentavos ?? 0) > 0)
  if (conPago) {
    throw new Error(
      `La cuota ${conPago.numero} (${fechaCorta(conPago.fechaVencimiento)}) ya tiene pagos. Elegí una fecha posterior a esa cuota.`,
    )
  }
}

export function calcularPenalidad(penalidad: Penalidad, capitalCentavos: number, interesCentavos: number): number {
  switch (penalidad.tipo) {
    case 'ninguna':
      return 0
    case 'porcentaje_interes':
      return Math.round((interesCentavos * penalidad.valorPct) / 100)
    case 'porcentaje_capital':
      return Math.round((capitalCentavos * penalidad.valorPct) / 100)
    case 'monto_fijo':
      return penalidad.montoCentavos
  }
}

interface Devengado {
  desde: string
  saldo: number
  interes: number
  tasaPct: number
  dias: number
  estimada: boolean
  ajuste: number
  indiceValor: number | null
}

/** Interés que corre desde la última cuota anterior a la fecha (o desde el alta) hasta la fecha. */
function devengado(inv: InversionParaOperar, antes: readonly Cuota[], fecha: string, fuentes: FuentesTasas): Devengado {
  const ultima = antes.at(-1)
  const desde = ultima ? ultima.fechaVencimiento : inv.fechaAlta
  const saldo = ultima ? ultima.saldoCapitalCentavos : inv.capitalCentavos
  if (fecha <= desde) throw new Error('La fecha tiene que ser posterior al alta y a la última cuota vencida')
  const tasa = tasaDelPeriodo(inv.tasa, desde, fuentes)
  let interes = interesSimple(saldo, tasa.tnaPct, inv.baseDias, desde, fecha)
  let ajuste = 0
  let indiceValor: number | null = null
  let estimada = tasa.estimada
  if (inv.tasa.tipo === 'ajustable') {
    const idx = fuentes.indice?.(fecha)
    if (!idx || !inv.indiceAlta) throw new Error('No hay valores del índice. Actualizá las tasas del BCRA.')
    const r = idx.valor / inv.indiceAlta
    ajuste = Math.round(saldo * (r - 1))
    interes *= r
    indiceValor = idx.valor
    estimada = estimada || idx.estimada
  }
  return {
    desde,
    saldo,
    interes: Math.round(interes),
    tasaPct: tasa.tnaPct,
    dias: diasDelPeriodo(inv.baseDias, desde, fecha),
    estimada,
    ajuste,
    indiceValor,
  }
}

export interface ResultadoOperacion {
  cronograma: Cuota[]
  resumen: string
}

/** Devolver todo antes de tiempo: capital que queda + interés hasta la fecha − penalidad. */
export function precancelar(input: {
  inversion: InversionParaOperar
  fecha: string
  penalidad: Penalidad
  pagos: readonly PagosDeCuota[]
  fuentes?: FuentesTasas
}): ResultadoOperacion {
  const { inversion: inv, fecha } = input
  const { antes, desde } = partir(inv.cronograma, fecha)
  if (desde.length === 0) throw new Error('No quedan cuotas después de esa fecha: no hay nada para precancelar')
  verificarSinPagos(desde, input.pagos)
  const d = devengado(inv, antes, fecha, input.fuentes ?? {})
  const penalidad = Math.min(calcularPenalidad(input.penalidad, d.saldo, d.interes), d.saldo + d.ajuste + d.interes)
  const total = d.saldo + d.ajuste + d.interes - penalidad
  const nueva: Cuota = {
    numero: siguienteNumero(inv.cronograma),
    tipo: 'precancelacion',
    fechaVencimiento: fecha,
    diasPeriodo: d.dias,
    tasaAplicadaPct: d.tasaPct,
    capitalCentavos: d.saldo,
    interesCentavos: d.interes,
    ajusteCentavos: d.ajuste,
    penalidadCentavos: penalidad,
    totalCentavos: total,
    saldoCapitalCentavos: 0,
    estimada: d.estimada,
    indiceValor: d.indiceValor,
  }
  const anuladas = new Set(desde.map((c) => c.numero))
  const cronograma = [...inv.cronograma.map((c) => (anuladas.has(c.numero) ? { ...c, anulada: true } : c)), nueva]
  return {
    cronograma,
    resumen: `Precancelación el ${fechaCorta(fecha)}: se devuelven ${desde.length} cuota(s) juntas. Capital ${montoTexto(d.saldo, inv.moneda)}, interés ${montoTexto(d.interes, inv.moneda)}, penalidad ${montoTexto(penalidad, inv.moneda)}. Total ${montoTexto(total, inv.moneda)}.`,
  }
}

/** Devolver una parte del capital antes de tiempo y recalcular las cuotas que quedan. */
export function devolucionParcial(input: {
  inversion: InversionParaOperar
  fecha: string
  montoCentavos: number
  penalidad: Penalidad
  pagos: readonly PagosDeCuota[]
  fuentes?: FuentesTasas
}): ResultadoOperacion {
  const { inversion: inv, fecha, montoCentavos } = input
  const fuentes = input.fuentes ?? {}
  if (inv.sistema === 'a_medida') throw new Error('En cuotas a medida, cargá el nuevo cronograma completo en lugar de una devolución parcial')
  const { antes, desde } = partir(inv.cronograma, fecha)
  if (desde.length === 0) throw new Error('No quedan cuotas después de esa fecha')
  verificarSinPagos(desde, input.pagos)
  const d = devengado(inv, antes, fecha, fuentes)
  if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) throw new Error('Indicá cuánto capital se devuelve')
  if (montoCentavos >= d.saldo) throw new Error('Para devolver todo el capital usá la precancelación')
  const penalidad = Math.min(calcularPenalidad(input.penalidad, montoCentavos, d.interes), d.interes)
  // El ajuste UVA/CER de la parte devuelta se paga junto con ella.
  const ajusteParte = d.saldo > 0 ? Math.round((d.ajuste * montoCentavos) / d.saldo) : 0
  let numero = siguienteNumero(inv.cronograma)
  const parcial: Cuota = {
    numero,
    tipo: 'devolucion_parcial',
    fechaVencimiento: fecha,
    diasPeriodo: d.dias,
    tasaAplicadaPct: d.tasaPct,
    capitalCentavos: montoCentavos,
    interesCentavos: d.interes,
    ajusteCentavos: ajusteParte,
    penalidadCentavos: penalidad,
    totalCentavos: montoCentavos + ajusteParte + d.interes - penalidad,
    saldoCapitalCentavos: d.saldo - montoCentavos,
    estimada: d.estimada,
    indiceValor: d.indiceValor,
  }
  numero += 1
  const fechasRestantes = desde.map((c) => c.fechaVencimiento).filter((f) => f > fecha)
  const resto =
    fechasRestantes.length > 0
      ? generarTramo(
          {
            sistema: inv.sistema === 'al_vencimiento' ? 'americano' : inv.sistema,
            baseDias: inv.baseDias,
            tasa: inv.tasa,
            inicio: fecha,
            saldoCentavos: d.saldo - montoCentavos,
            fechas: fechasRestantes,
            numeroInicial: numero,
            indiceAlta: inv.indiceAlta,
          },
          fuentes,
        )
      : []
  if (resto.length === 0) throw new Error('La devolución parcial tiene que ser antes del último vencimiento')
  const anuladas = new Set(desde.map((c) => c.numero))
  return {
    cronograma: [...inv.cronograma.map((c) => (anuladas.has(c.numero) ? { ...c, anulada: true } : c)), parcial, ...resto],
    resumen: `Devolución parcial el ${fechaCorta(fecha)} de ${montoTexto(montoCentavos, inv.moneda)} de capital. Se recalculan ${resto.length} cuota(s).`,
  }
}

/**
 * Renovación al vencimiento. La última cuota no se paga entera: una parte pasa a una inversión nueva.
 * Devuelve el cronograma de la inversión vieja y el capital con el que arranca la nueva.
 */
export function renovar(input: {
  inversion: InversionParaOperar
  modalidad: ModalidadRenovacion
  montoCentavos?: number | null
  pagos: readonly PagosDeCuota[]
}): ResultadoOperacion & { capitalRenovadoCentavos: number; fechaRenovacion: string } {
  const lista = vivas(input.inversion.cronograma)
  const ultima = lista.at(-1)
  if (!ultima) throw new Error('La inversión no tiene cuotas')
  verificarSinPagos([ultima], input.pagos)
  const capital = ultima.capitalCentavos + ultima.ajusteCentavos
  let renovado: number
  switch (input.modalidad) {
    case 'capital_e_intereses':
      renovado = ultima.totalCentavos
      break
    case 'solo_capital':
      renovado = capital
      break
    case 'monto': {
      const monto = input.montoCentavos ?? 0
      if (!Number.isInteger(monto) || monto <= 0) throw new Error('Indicá cuánto se renueva')
      if (monto > ultima.totalCentavos) throw new Error('No se puede renovar más de lo que vence')
      renovado = monto
      break
    }
  }
  return {
    cronograma: input.inversion.cronograma.map((c) => (c.numero === ultima.numero ? { ...c, renovadaCentavos: renovado } : c)),
    capitalRenovadoCentavos: renovado,
    fechaRenovacion: ultima.fechaVencimiento,
    resumen: `Renovación al ${fechaCorta(ultima.fechaVencimiento)}: pasan ${montoTexto(renovado, input.inversion.moneda)} a la inversión nueva y se pagan ${montoTexto(ultima.totalCentavos - renovado, input.inversion.moneda)}.`,
  }
}
