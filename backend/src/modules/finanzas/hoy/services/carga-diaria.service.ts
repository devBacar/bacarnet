import { agendaTimestampToDate } from '../../agenda/domain/agendaTimestamps.js'
import type { CompromisoPagoDocument, MedioPago } from '../../agenda/domain/agenda.types.js'
import { normalizarGrupo, normalizarMoneda } from '../../agenda/domain/compromiso-campos.js'
import { listarPagos } from '../../agenda/domain/pago-compromiso.js'
import { dateKeyInArgentina } from '../../agenda/domain/vencimiento.alert.js'
import { listAllCompromisos } from '../../agenda/services/agenda.repository.js'
import {
  countChequesFiltrados,
  pageCheques,
  type ChequesFiltro,
  type ChequeListadoItem,
} from '../../cheques/services/cheques.repository.js'
import { armarCargaDiaria, type CargaDiaria } from '../domain/carga-diaria.js'
import { chequeEmitidoVigente } from '../domain/cheques-hoy.js'
import { agregarChequesSueltos, sumarDiasCalendario, type CompromisoParaPlanilla } from '../domain/compromisos-mes.js'
import { feriadosNacionales2026 } from '../domain/feriados-nacionales-2026.js'
import { fechaHoyArgentina } from '../domain/hoy.fechas.js'
import type { OrigenCompromisoHoy } from '../domain/hoy.tipos.js'
import { getTipoCambioMes } from './tipo-cambio-mes.repository.js'

const FILTRO_CHEQUE_EMITIDO_VACIO: Omit<ChequesFiltro, 'direccion' | 'desde' | 'hasta'> = {
  origen: null,
  estado: null,
  tipo: null,
  vinculacion: null,
  comprobante: null,
  q: null,
}

async function listarChequesEmitidosDelTramo(desde: string, hasta: string): Promise<ChequeListadoItem[]> {
  const filtro: ChequesFiltro = { ...FILTRO_CHEQUE_EMITIDO_VACIO, direccion: 'emitido', desde, hasta }
  const total = await countChequesFiltrados(filtro)
  const filas: ChequeListadoItem[] = []
  const limit = 300
  for (let offset = 0; offset < total; offset += limit) {
    const page = await pageCheques({ filtro, offset, limit })
    filas.push(...page)
    if (page.length === 0) break
  }
  return filas
}

function origenDe(value: string | undefined): OrigenCompromisoHoy {
  return value === 'vientri' || value === 'vientri-cheque' || value === 'inversiones' || value === 'planilla' ? value : 'manual'
}

export const DIAS_CARGA_MAXIMO = 62
export const DIAS_CARGA_POR_DEFECTO = 30

export class CargaDiariaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function dia(value: unknown): string | null {
  const date = agendaTimestampToDate(value)
  return date ? dateKeyInArgentina(date) : null
}

function medioDe(value: MedioPago | undefined): MedioPago {
  return value === 'efectivo' || value === 'cheque' ? value : 'transferencia'
}

function aCompromiso(id: string, data: CompromisoPagoDocument): CompromisoParaPlanilla | null {
  const fechaVencimiento = dia(data.fechaVencimiento)
  if (!fechaVencimiento) return null
  if (typeof data.montoCentavos !== 'number' || data.montoCentavos <= 0) return null
  return {
    id,
    concepto: data.concepto,
    proveedorONombre: data.proveedorONombre,
    montoCentavos: data.montoCentavos,
    fechaVencimiento,
    fechaPago: dia(data.fechaPago),
    estado: data.estado,
    medioPago: medioDe(data.medioPago),
    grupo: normalizarGrupo(data.grupo),
    origen: origenDe(data.origen),
    moneda: normalizarMoneda(data.moneda),
    deudaTotalCentavos: null,
    cuotaNumero: null,
    cuotaTotal: null,
    observacion: null,
    pagos: listarPagos(data.pagos),
    vientriChequeNumero: data.vientriCheque?.numero ?? null,
  }
}

/** Carga de pagos por día. Toma todo lo que está en la Agenda (facturas, cheques emitidos, inversiones, planilla). */
export async function getCargaDiaria(input: { desde?: string; dias?: number; now?: Date }): Promise<CargaDiaria> {
  const now = input.now ?? new Date()
  const hoy = fechaHoyArgentina(now)
  const desde = input.desde ?? hoy
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) throw new CargaDiariaError('La fecha tiene que ser AAAA-MM-DD', 400)
  const dias = input.dias ?? DIAS_CARGA_POR_DEFECTO
  if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_CARGA_MAXIMO) {
    throw new CargaDiariaError(`Pedí entre 1 y ${DIAS_CARGA_MAXIMO} días`, 400)
  }
  const hasta = sumarDiasCalendario(desde, Math.max(1, dias) - 1)
  const [rows, tipo, chequesDelTramo] = await Promise.all([
    listAllCompromisos(),
    getTipoCambioMes(desde.slice(0, 7)),
    listarChequesEmitidosDelTramo(desde, hasta),
  ])
  const bases = rows.flatMap((row) => {
    const mapeado = aCompromiso(row.id, row.data)
    return mapeado ? [mapeado] : []
  })
  const compromisos = agregarChequesSueltos(
    bases,
    chequesDelTramo.filter((cheque) => chequeEmitidoVigente(cheque)),
  )
  return armarCargaDiaria({
    desde,
    dias,
    hoy,
    tipoCambio: tipo?.usdArs ?? null,
    feriados: feriadosNacionales2026(),
    compromisos,
  })
}
