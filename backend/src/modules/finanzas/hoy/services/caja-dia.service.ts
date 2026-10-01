import { adminDb } from '../../../../lib/firebase/admin.js'
import { saldoDeltaPorMovimiento } from '../../cajachica/domain/cierre.calculo.js'
import type { CajaMovimientoTipo } from '../../cajachica/domain/caja.types.js'
import { listCajasDocs, listMovimientosForCaja } from '../../cajachica/services/caja.repository.js'
import { sumarDias, ultimoDiaHabil, validarFechaCashflow } from '../../cashflow/domain/cashflow.js'
import { CHEQUES_COLLECTION } from '../../cheques/services/cheques.repository.js'
import {
  mezclarDetallesCaja,
  palabrasDetalleCajaPorDefecto,
  resolverDetalleCaja,
} from '../../movimientos/domain/detalle-caja.js'
import { listDetallesCajaGuardados } from '../../movimientos/services/detalles-caja.repository.js'
import { listCategoriaMovimientoDocuments } from '../../movimientos/services/categorias-movimientos.repository.js'
import { listMovimientosCajaDelDia } from '../../movimientos/services/movimientos.repository.js'
import {
  dateIdInArgentina,
  getPosicionCierreAnterior,
  getPosicionCierreDocument,
  listCuentaDocuments,
} from '../../services/cuentas.repository.js'
import { listSaldosDiariosDeCuentas } from '../../services/saldos-diarios.repository.js'
import type { PosicionCierreDocument } from '../../domain/cuenta.types.js'
import {
  agruparLineasCaja,
  armarColumnaCheques,
  armarEfectivoDia,
  controlArrancaLineasSaldo,
  ordenBancoCaja,
  resolverSaldosColumnaBanco,
  type ChequeParaCaja,
  type ColumnaValoresCaja,
  type CuadreCaja,
  type LineaCaja,
  type MovimientoEfectivoDia,
} from '../domain/caja-dia.js'

export class CajaDiaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'CajaDiaError'
  }
}

export interface BancoCajaDia {
  bancoNombre: string
  cuentaId: string
  arrancaCentavos: number | null
  saldoCentavos: number | null
  descubiertoCentavos: number | null
  faltanteCentavos: number
  origenSaldo: 'banco' | 'cierre15'
  lineas: LineaCaja[]
  cuadre: CuadreCaja
}

export interface CajaDiaResponse {
  fecha: string
  bancos: BancoCajaDia[]
  efectivo: {
    arrancaCentavos: number
    saldoCentavos: number
    lineas: ColumnaValoresCaja['lineas']
  }
  cheques: ColumnaValoresCaja
  echeq: ColumnaValoresCaja
  dolares: Array<{ bancoNombre: string; cuentaId: string; saldoCentavos: number }>
  /** Vacío hasta que haya una fuente de saldos de fondos. No se inventan. */
  fondos: Array<{ nombre: string; saldoCentavos: number }>
}

function saldoCierre15(data: PosicionCierreDocument | undefined, cuentaId: string): number | null {
  const cuenta = data?.cuentas.find((item) => item.cuentaId === cuentaId && item.moneda === 'ARS')
  return cuenta && Number.isFinite(cuenta.saldoCentavos) ? cuenta.saldoCentavos : null
}

function fechaDeTimestamp(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('toDate' in value)) return null
  const toDate = (value as { toDate?: unknown }).toDate
  if (typeof toDate !== 'function') return null
  const date = toDate.call(value) as Date
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  return dateIdInArgentina(date)
}

async function listarChequesParaCaja(): Promise<ChequeParaCaja[]> {
  const snap = await adminDb()
    .collection(CHEQUES_COLLECTION)
    .where('direccion', '==', 'recibido')
    .select(
      'tipo',
      'direccion',
      'estado',
      'utilizado',
      'montoCentavos',
      'fechaRecibido',
      'observaciones',
      'cliente',
      'emisor',
      'destinatario',
      'updatedAt',
    )
    .get()

  return snap.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      tipo: typeof data.tipo === 'string' ? data.tipo : '',
      direccion: typeof data.direccion === 'string' ? data.direccion : '',
      estado: typeof data.estado === 'string' ? data.estado : '',
      utilizado: typeof data.utilizado === 'boolean' ? data.utilizado : null,
      montoCentavos: typeof data.montoCentavos === 'number' ? data.montoCentavos : 0,
      fechaRecibido: typeof data.fechaRecibido === 'string' ? data.fechaRecibido : null,
      observaciones: typeof data.observaciones === 'string' ? data.observaciones : null,
      cliente: typeof data.cliente === 'string' ? data.cliente : null,
      emisor: typeof data.emisor === 'string' ? data.emisor : '',
      destinatario: typeof data.destinatario === 'string' ? data.destinatario : null,
      actualizadoFecha: fechaDeTimestamp(data.updatedAt),
    }
  })
}

async function movimientosEfectivo(cajaId: string): Promise<MovimientoEfectivoDia[]> {
  const rows = await listMovimientosForCaja(cajaId)
  const movimientos: MovimientoEfectivoDia[] = []
  for (const row of rows) {
    const fecha = fechaDeTimestamp(row.data.fecha)
    if (!fecha) continue
    if (typeof row.data.montoCentavos !== 'number') continue
    const tipo = row.data.tipo as CajaMovimientoTipo
    const delta = saldoDeltaPorMovimiento(tipo) * row.data.montoCentavos
    movimientos.push({
      fecha,
      deltaCentavos: delta,
      concepto: typeof row.data.concepto === 'string' ? row.data.concepto : '',
    })
  }
  return movimientos
}

export async function listarDetallesCaja() {
  const guardados = await listDetallesCajaGuardados()
  return {
    detalles: mezclarDetallesCaja({
      tabla: palabrasDetalleCajaPorDefecto(),
      guardados,
    }),
  }
}

export async function getCajaDia(input: { fecha?: string }): Promise<CajaDiaResponse> {
  const hoy = dateIdInArgentina(new Date())
  const fecha = input.fecha?.trim() || ultimoDiaHabil(hoy)
  try {
    validarFechaCashflow(fecha, hoy)
  } catch (err) {
    throw new CajaDiaError(err instanceof Error ? err.message : 'fecha inválida', 400)
  }

  const [cuentas, categorias, movimientos, anterior, cierre, cajas, cheques] = await Promise.all([
    listCuentaDocuments(),
    listCategoriaMovimientoDocuments(),
    listMovimientosCajaDelDia(fecha),
    getPosicionCierreAnterior(fecha),
    getPosicionCierreDocument(fecha),
    listCajasDocs(),
    listarChequesParaCaja(),
  ])

  const nombreCategoria = new Map(categorias.map((categoria) => [categoria.id, categoria.data.nombre]))
  const pesos = cuentas
    .filter((cuenta) => cuenta.data.tipo === 'CC' && cuenta.data.moneda === 'ARS')
    .sort(
      (a, b) =>
        ordenBancoCaja(a.data.bancoNombre) - ordenBancoCaja(b.data.bancoNombre) ||
        a.data.bancoNombre.localeCompare(b.data.bancoNombre, 'es') ||
        a.id.localeCompare(b.id),
    )

  const saldosDiarios = await listSaldosDiariosDeCuentas({
    cuentaIds: pesos.map((cuenta) => cuenta.id),
    desde: sumarDias(fecha, -45),
    hasta: fecha,
  })

  const bancos: BancoCajaDia[] = pesos.map((cuenta) => {
    const delBanco = movimientos.filter((movimiento) => movimiento.cuentaId === cuenta.id)
    let entradasCentavos = 0
    let salidasCentavos = 0
    const paraLineas = delBanco.map((movimiento) => {
      if (movimiento.tipo === 'credito') entradasCentavos += movimiento.montoCentavos
      else salidasCentavos += movimiento.montoCentavos
      const firmado = movimiento.tipo === 'debito' ? -movimiento.montoCentavos : movimiento.montoCentavos
      const resuelto = resolverDetalleCaja({
        detalleCaja: movimiento.detalleCaja,
        detalleCajaOrigen: movimiento.detalleCajaOrigen,
        categoriaNombre: movimiento.categoriaId ? (nombreCategoria.get(movimiento.categoriaId) ?? null) : null,
        contraparteNombre: movimiento.contraparteNombre ?? movimiento.depositorDescription,
        descripcion: movimiento.descripcion,
        bancoNombre: cuenta.data.bancoNombre,
      })
      return {
        id: movimiento.id,
        detalle: resuelto.detalle,
        origen: resuelto.origen,
        centavos: firmado,
        textoBanco: movimiento.descripcion,
      }
    })
    const lineas = agruparLineasCaja(paraLineas)
    const saldos = resolverSaldosColumnaBanco({
      fecha,
      hoy,
      docs: saldosDiarios
        .filter((doc) => doc.cuentaId === cuenta.id && doc.moneda === 'ARS')
        .map((doc) => ({
          cuentaId: doc.cuentaId,
          fecha: doc.fecha,
          estado: doc.estado,
          saldoInicioCentavos: doc.saldoInicioCentavos,
          saldoFinCentavos: doc.saldoFinCentavos,
        })),
      cierre15Anterior:
        saldoCierre15(anterior?.data, cuenta.id) == null
          ? null
          : { saldoCentavos: saldoCierre15(anterior?.data, cuenta.id)! },
      cierre15Dia:
        saldoCierre15(cierre?.data, cuenta.id) == null
          ? null
          : { saldoCentavos: saldoCierre15(cierre?.data, cuenta.id)! },
      entradasCentavos,
      salidasCentavos,
    })
    const descubierto =
      typeof cuenta.data.descubiertoCentavos === 'number' && cuenta.data.descubiertoCentavos > 0
        ? cuenta.data.descubiertoCentavos
        : null
    return {
      bancoNombre: cuenta.data.bancoNombre,
      cuentaId: cuenta.id,
      arrancaCentavos: saldos.arrancaCentavos,
      saldoCentavos: saldos.saldoCentavos,
      descubiertoCentavos: descubierto,
      faltanteCentavos: saldos.faltanteCentavos,
      origenSaldo: saldos.origenSaldo,
      lineas,
      cuadre: controlArrancaLineasSaldo({
        arrancaCentavos: saldos.arrancaCentavos,
        lineasCentavos: lineas.reduce((suma, linea) => suma + linea.centavos, 0),
        saldoCentavos: saldos.saldoCentavos,
      }),
    }
  })

  const cajasPesos = cajas.filter((caja) => caja.data.moneda === 'ARS' && caja.data.estado !== 'inactiva')
  const movimientosPorCaja = await Promise.all(
    cajasPesos.map(async (caja) => ({
      saldoActualCentavos: caja.data.saldoActualCentavos,
      movimientos: await movimientosEfectivo(caja.id),
    })),
  )

  const dolares = cuentas
    .filter((cuenta) => cuenta.data.moneda === 'USD' || cuenta.data.tipo === 'USD')
    .sort(
      (a, b) =>
        ordenBancoCaja(a.data.bancoNombre) - ordenBancoCaja(b.data.bancoNombre) ||
        a.data.bancoNombre.localeCompare(b.data.bancoNombre, 'es'),
    )
    .map((cuenta) => ({
      bancoNombre: cuenta.data.bancoNombre,
      cuentaId: cuenta.id,
      saldoCentavos: Number.isFinite(cuenta.data.saldoActualCentavos) ? cuenta.data.saldoActualCentavos : 0,
    }))

  return {
    fecha,
    bancos,
    efectivo: armarEfectivoDia({ fecha, cajas: movimientosPorCaja }),
    cheques: armarColumnaCheques(cheques, fecha, 'fisico'),
    echeq: armarColumnaCheques(cheques, fecha, 'echeq'),
    dolares,
    fondos: [],
  }
}
