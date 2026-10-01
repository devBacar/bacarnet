import { esChequeEnCartera } from './cheques-hoy.js'
import {
  calcularFaltanteCentavos,
  elegirSaldoInicio,
  esFinDeSemana,
  type SaldoDiarioCashflow,
} from '../../cashflow/domain/cashflow.js'

/** Menos de un peso: se muestra como redondeo, no como un faltante del banco. */
export const UMBRAL_REDONDEO_CAJA_CENTAVOS = 100

export const ORDEN_BANCOS_CAJA = ['Córdoba', 'Patagonia', 'Julio'] as const

export interface LineaCaja {
  detalle: string
  /** Con signo: entra positivo, sale negativo. */
  centavos: number
  cantidad: number
  movimientoIds: string[]
  origen: 'manual' | 'sugerido'
  /** Texto del banco si todos los de la línea dicen lo mismo. Si no, null. */
  textoBanco: string | null
}

export interface MovimientoParaLinea {
  id: string
  detalle: string
  origen: 'manual' | 'sugerido'
  centavos: number
  textoBanco: string
}

export interface CuadreCaja {
  diferenciaCentavos: number | null
  esRedondeo: boolean
  cuadra: boolean
}

export interface SaldosColumnaBanco {
  arrancaCentavos: number | null
  saldoCentavos: number | null
  faltanteCentavos: number
  origenSaldo: 'banco' | 'cierre15'
}

/**
 * Agrupa por detalle y por signo. Dos "cliente" que entran van en una línea;
 * un "cliente" que sale va en otra.
 */
export function agruparLineasCaja(movimientos: readonly MovimientoParaLinea[]): LineaCaja[] {
  const grupos = new Map<
    string,
    {
      detalle: string
      centavos: number
      movimientoIds: string[]
      origenes: Set<'manual' | 'sugerido'>
      textos: Set<string>
    }
  >()
  const orden: string[] = []

  for (const movimiento of movimientos) {
    if (!Number.isFinite(movimiento.centavos) || movimiento.centavos === 0) continue
    const detalle = movimiento.detalle.trim() || 'movimiento'
    const signo = movimiento.centavos < 0 ? '-' : '+'
    const key = `${detalle}\u0000${signo}`
    let grupo = grupos.get(key)
    if (!grupo) {
      grupo = {
        detalle,
        centavos: 0,
        movimientoIds: [],
        origenes: new Set(),
        textos: new Set(),
      }
      grupos.set(key, grupo)
      orden.push(key)
    }
    grupo.centavos += movimiento.centavos
    grupo.movimientoIds.push(movimiento.id)
    grupo.origenes.add(movimiento.origen)
    const texto = movimiento.textoBanco.trim()
    if (texto) grupo.textos.add(texto)
  }

  return orden.map((key) => {
    const grupo = grupos.get(key)!
    const textos = [...grupo.textos]
    const soloManual = grupo.origenes.size === 1 && grupo.origenes.has('manual')
    return {
      detalle: grupo.detalle,
      centavos: grupo.centavos,
      cantidad: grupo.movimientoIds.length,
      movimientoIds: grupo.movimientoIds,
      origen: soloManual ? 'manual' : 'sugerido',
      textoBanco: textos.length === 1 ? textos[0] : null,
    }
  })
}

/** arranca + líneas − saldo. Cuadra solo si da cero. */
export function controlArrancaLineasSaldo(input: {
  arrancaCentavos: number | null
  lineasCentavos: number
  saldoCentavos: number | null
}): CuadreCaja {
  if (input.arrancaCentavos == null || input.saldoCentavos == null) {
    return { diferenciaCentavos: null, esRedondeo: false, cuadra: false }
  }
  const diferenciaCentavos = input.saldoCentavos - input.arrancaCentavos - input.lineasCentavos
  const esRedondeo = diferenciaCentavos !== 0 && Math.abs(diferenciaCentavos) < UMBRAL_REDONDEO_CAJA_CENTAVOS
  return {
    diferenciaCentavos,
    esRedondeo,
    cuadra: diferenciaCentavos === 0,
  }
}

/**
 * Si el día es hoy y el banco informó con qué saldo arrancó, usamos ese.
 * Si no, el cierre del último día hábil anterior. Sin nada de eso, el cierre de las 15.
 */
export function resolverSaldosColumnaBanco(input: {
  fecha: string
  hoy: string
  docs: SaldoDiarioCashflow[]
  cierre15Anterior: { saldoCentavos: number } | null
  cierre15Dia: { saldoCentavos: number } | null
  entradasCentavos: number
  salidasCentavos: number
}): SaldosColumnaBanco {
  const docs = input.docs.filter((doc) => !esFinDeSemana(doc.fecha))
  const docFecha = docs.find((doc) => doc.fecha === input.fecha)
  if (docFecha) {
    const inicio = elegirSaldoInicio({ fecha: input.fecha, hoy: input.hoy, docs })
    return {
      arrancaCentavos: inicio?.centavos ?? null,
      saldoCentavos: docFecha.saldoFinCentavos,
      origenSaldo: 'banco',
      faltanteCentavos: calcularFaltanteCentavos({
        saldoInicioCentavos: inicio?.centavos ?? null,
        saldoFinCentavos: docFecha.saldoFinCentavos,
        entradasCentavos: input.entradasCentavos,
        salidasCentavos: input.salidasCentavos,
      }),
    }
  }

  const arrancaCentavos = input.cierre15Anterior ? input.cierre15Anterior.saldoCentavos : null
  if (input.cierre15Dia) {
    return {
      arrancaCentavos,
      saldoCentavos: input.cierre15Dia.saldoCentavos,
      origenSaldo: 'cierre15',
      faltanteCentavos: 0,
    }
  }

  const estimado =
    arrancaCentavos == null ? null : arrancaCentavos + input.entradasCentavos - input.salidasCentavos
  return {
    arrancaCentavos,
    saldoCentavos: estimado,
    origenSaldo: 'cierre15',
    faltanteCentavos: 0,
  }
}

export function ordenBancoCaja(bancoNombre: string): number {
  const index = ORDEN_BANCOS_CAJA.indexOf(bancoNombre as (typeof ORDEN_BANCOS_CAJA)[number])
  return index === -1 ? ORDEN_BANCOS_CAJA.length : index
}

export interface ChequeParaCaja {
  id: string
  tipo: string
  direccion: string
  estado: string
  utilizado: boolean | null
  montoCentavos: number
  fechaRecibido: string | null
  observaciones: string | null
  cliente: string | null
  emisor: string
  destinatario: string | null
  /** Día en Argentina de updatedAt. No usamos fechaEntregado. */
  actualizadoFecha: string | null
}

export interface ColumnaValoresCaja {
  saldoCentavos: number
  /** Cuántos cheques suman el saldo en cartera. */
  cantidadEnCartera: number
  lineas: Array<{ detalle: string; centavos: number; cantidad: number }>
}

/** Utilizado = depositado, endosado o vendido. fechaEntregado no entra en la cuenta. */
export function chequeUtilizadoEnCaja(cheque: {
  utilizado: boolean | null
  estado: string
  destinatario?: string | null
}): boolean {
  if (cheque.utilizado === true) return true
  if (cheque.estado === 'depositado' || cheque.estado === 'vendido') return true
  return false
}

function marcaDeExcel(observaciones: string | null): boolean {
  return /^(utilizado|depositado|vendido|en cartera)\b/i.test(observaciones?.trim() ?? '')
}

function detalleRecibido(cheque: ChequeParaCaja): string {
  const nombre = cheque.cliente?.trim() || cheque.emisor.trim()
  return nombre ? nombre.toLocaleLowerCase('es').replace(/\s+/g, ' ').slice(0, 40) : 'recibido'
}

function detalleUsado(cheque: ChequeParaCaja): string {
  if (cheque.estado === 'depositado') return 'dep cheque'
  const destinatario = cheque.destinatario?.trim()
  if (destinatario) return destinatario.toLocaleLowerCase('es').replace(/\s+/g, ' ').slice(0, 40)
  if (cheque.estado === 'vendido') return 'endosado'
  return 'cheques'
}

/**
 * Usado ese día: está utilizado y el cambio se hizo en BacarNet ese día.
 * El Excel deja la fecha del prefijo en observaciones, pero esa fecha es
 * vencimiento, no el día de uso: no la tomamos (tampoco fechaEntregado).
 */
export function chequeUsadoElDia(cheque: ChequeParaCaja, fecha: string): boolean {
  if (!chequeUtilizadoEnCaja(cheque)) return false
  if (marcaDeExcel(cheque.observaciones)) return false
  return cheque.actualizadoFecha === fecha
}

export function armarColumnaCheques(
  cheques: readonly ChequeParaCaja[],
  fecha: string,
  tipo: 'echeq' | 'fisico',
): ColumnaValoresCaja {
  const delTipo = cheques.filter((cheque) => (tipo === 'echeq' ? cheque.tipo === 'echeq' : cheque.tipo !== 'echeq'))
  let saldoCentavos = 0
  let cantidadEnCartera = 0
  const aportes: MovimientoParaLinea[] = []

  for (const cheque of delTipo) {
    if (!Number.isFinite(cheque.montoCentavos) || cheque.montoCentavos <= 0) continue
    if (
      esChequeEnCartera({
        direccion: cheque.direccion,
        utilizado: cheque.utilizado === true || cheque.estado === 'depositado' || cheque.estado === 'vendido' ? true : cheque.utilizado,
        estado: cheque.estado,
      })
    ) {
      saldoCentavos += cheque.montoCentavos
      cantidadEnCartera += 1
    }
    if (cheque.direccion === 'recibido' && cheque.fechaRecibido === fecha) {
      aportes.push({
        id: `${cheque.id}:recibido`,
        detalle: detalleRecibido(cheque),
        origen: 'manual',
        centavos: cheque.montoCentavos,
        textoBanco: '',
      })
    }
    if (chequeUsadoElDia(cheque, fecha)) {
      aportes.push({
        id: `${cheque.id}:usado`,
        detalle: detalleUsado(cheque),
        origen: 'manual',
        centavos: -cheque.montoCentavos,
        textoBanco: '',
      })
    }
  }

  return {
    saldoCentavos,
    cantidadEnCartera,
    lineas: agruparLineasCaja(aportes).map((linea) => ({
      detalle: linea.detalle,
      centavos: linea.centavos,
      cantidad: linea.cantidad,
    })),
  }
}

export interface MovimientoEfectivoDia {
  fecha: string
  deltaCentavos: number
  concepto: string
}

/**
 * El saldo de la caja es el de ahora. Para un día pasado se le restan
 * los movimientos posteriores, así arranca + líneas = saldo de ese día.
 */
export function armarEfectivoDia(input: {
  fecha: string
  cajas: ReadonlyArray<{ saldoActualCentavos: number; movimientos: readonly MovimientoEfectivoDia[] }>
}): { arrancaCentavos: number; saldoCentavos: number; lineas: ColumnaValoresCaja['lineas'] } {
  let arrancaCentavos = 0
  let saldoCentavos = 0
  const delDia: MovimientoParaLinea[] = []
  let n = 0

  for (const caja of input.cajas) {
    const saldoActual = Number.isFinite(caja.saldoActualCentavos) ? caja.saldoActualCentavos : 0
    let posteriores = 0
    let netoDia = 0
    for (const movimiento of caja.movimientos) {
      if (!Number.isFinite(movimiento.deltaCentavos) || movimiento.deltaCentavos === 0) continue
      if (movimiento.fecha > input.fecha) posteriores += movimiento.deltaCentavos
      if (movimiento.fecha !== input.fecha) continue
      netoDia += movimiento.deltaCentavos
      const concepto = movimiento.concepto.trim().replace(/\s+/g, ' ') || 'efectivo'
      delDia.push({
        id: String(n),
        detalle: concepto,
        origen: 'manual',
        centavos: movimiento.deltaCentavos,
        textoBanco: concepto,
      })
      n += 1
    }
    const saldoCierre = saldoActual - posteriores
    saldoCentavos += saldoCierre
    arrancaCentavos += saldoCierre - netoDia
  }

  return {
    arrancaCentavos,
    saldoCentavos,
    lineas: agruparLineasCaja(delDia).map((linea) => ({
      detalle: linea.detalle,
      centavos: linea.centavos,
      cantidad: linea.cantidad,
    })),
  }
}
