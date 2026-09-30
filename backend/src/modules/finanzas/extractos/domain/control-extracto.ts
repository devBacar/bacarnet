import {
  huellaMovimiento,
  huellaMovimientoSinDescripcion,
  type HuellaMovimientoInput,
} from '../../movimientos/domain/movimiento-huella.js'
import type {
  ControlDia,
  ItemControl,
  MovimientoControlable,
  ResultadoControl,
} from './extracto.types.js'

interface SlotBacarnet {
  fila: MovimientoControlable
  usado: boolean
}

interface SlotExtracto {
  fila: MovimientoControlable
  usado: boolean
  categoriaId: string | null
}

function claveRespaldo(row: HuellaMovimientoInput): string {
  const parte = (value: unknown) => (value == null ? '' : String(value))
  return [
    parte(row.fechaProceso),
    parte(row.tipo),
    parte(row.montoCentavos),
    parte(row.voucherNumber),
    parte(row.correlativeNumber),
  ].join('\u001f')
}

function aItem(fila: MovimientoControlable): ItemControl {
  return {
    fecha: fila.fechaProceso,
    concepto: fila.descripcion,
    tipo: fila.tipo,
    montoCentavos: fila.montoCentavos,
  }
}

function ordenarItems(items: ItemControl[]): ItemControl[] {
  return [...items].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
    if (a.concepto !== b.concepto) return a.concepto < b.concepto ? -1 : 1
    return a.montoCentavos - b.montoCentavos
  })
}

/**
 * Una pasada: cada movimiento de BacarNet se entrega una sola vez.
 * Lo que ya encontró una pasada anterior no se vuelve a mirar.
 */
function emparejar(
  extracto: SlotExtracto[],
  bacarnet: SlotBacarnet[],
  keyFn: (row: MovimientoControlable) => string,
): void {
  const colas = new Map<string, SlotBacarnet[]>()
  for (const slot of bacarnet) {
    if (slot.usado) continue
    const clave = keyFn(slot.fila)
    const cola = colas.get(clave) ?? []
    cola.push(slot)
    colas.set(clave, cola)
  }
  for (const slot of extracto) {
    if (slot.usado) continue
    const pareja = colas.get(keyFn(slot.fila))?.shift()
    if (!pareja) continue
    pareja.usado = true
    slot.usado = true
    slot.categoriaId = pareja.fila.categoriaId ?? null
  }
}

function sumarPorFecha(filas: readonly MovimientoControlable[], tipo: 'debito' | 'credito'): Map<string, number> {
  const totales = new Map<string, number>()
  for (const fila of filas) {
    if (fila.tipo !== tipo) continue
    totales.set(fila.fechaProceso, (totales.get(fila.fechaProceso) ?? 0) + fila.montoCentavos)
  }
  return totales
}

/**
 * Compara el extracto con los movimientos de BacarNet de la misma cuenta y período.
 * Primero por la huella que ya usa el sync, después sin la descripción, y si no
 * por fecha + monto + tipo + comprobante/correlativo.
 * Los totales del día son los que declara el banco, contra la suma de BacarNet.
 */
export function controlarExtracto(input: {
  filas: readonly MovimientoControlable[]
  movimientosBacarnet: readonly MovimientoControlable[]
  dias: readonly { fecha: string; debitosCentavos: number; creditosCentavos: number }[]
}): ResultadoControl {
  const extracto: SlotExtracto[] = input.filas.map((fila) => ({ fila, usado: false, categoriaId: null }))
  const bacarnet: SlotBacarnet[] = input.movimientosBacarnet.map((fila) => ({ fila, usado: false }))

  emparejar(extracto, bacarnet, huellaMovimiento)
  emparejar(extracto, bacarnet, huellaMovimientoSinDescripcion)
  emparejar(extracto, bacarnet, claveRespaldo)

  const faltanEnBacarnet = ordenarItems(extracto.filter((slot) => !slot.usado).map((slot) => aItem(slot.fila)))
  const sobranEnBacarnet = ordenarItems(bacarnet.filter((slot) => !slot.usado).map((slot) => aItem(slot.fila)))

  const debitosBanco = new Map<string, number>()
  const creditosBanco = new Map<string, number>()
  for (const dia of input.dias) {
    debitosBanco.set(dia.fecha, (debitosBanco.get(dia.fecha) ?? 0) + dia.debitosCentavos)
    creditosBanco.set(dia.fecha, (creditosBanco.get(dia.fecha) ?? 0) + dia.creditosCentavos)
  }
  const debitosNuestros = sumarPorFecha(input.movimientosBacarnet, 'debito')
  const creditosNuestros = sumarPorFecha(input.movimientosBacarnet, 'credito')

  const fechas = new Set<string>([
    ...debitosBanco.keys(),
    ...creditosBanco.keys(),
    ...debitosNuestros.keys(),
    ...creditosNuestros.keys(),
  ])
  const porDia: ControlDia[] = [...fechas].sort().map((fecha) => {
    const debitosExtractoCentavos = debitosBanco.get(fecha) ?? 0
    const creditosExtractoCentavos = creditosBanco.get(fecha) ?? 0
    const debitosBacarnetCentavos = debitosNuestros.get(fecha) ?? 0
    const creditosBacarnetCentavos = creditosNuestros.get(fecha) ?? 0
    return {
      fecha,
      debitosExtractoCentavos,
      creditosExtractoCentavos,
      debitosBacarnetCentavos,
      creditosBacarnetCentavos,
      coincide:
        debitosExtractoCentavos === debitosBacarnetCentavos &&
        creditosExtractoCentavos === creditosBacarnetCentavos,
    }
  })

  const coincide =
    faltanEnBacarnet.length === 0 && sobranEnBacarnet.length === 0 && porDia.every((dia) => dia.coincide)

  return {
    coincide,
    faltanEnBacarnet,
    sobranEnBacarnet,
    porDia,
    categoriaIdPorFila: extracto.map((slot) => slot.categoriaId),
  }
}
