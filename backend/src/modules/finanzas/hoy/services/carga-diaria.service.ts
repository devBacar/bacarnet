import { agendaTimestampToDate } from '../../agenda/domain/agendaTimestamps.js'
import type { CompromisoPagoDocument, MedioPago } from '../../agenda/domain/agenda.types.js'
import { normalizarGrupo, normalizarMoneda } from '../../agenda/domain/compromiso-campos.js'
import { listarPagos } from '../../agenda/domain/pago-compromiso.js'
import { dateKeyInArgentina } from '../../agenda/domain/vencimiento.alert.js'
import { listAllCompromisos } from '../../agenda/services/agenda.repository.js'
import { armarCargaDiaria, type CargaDiaria } from '../domain/carga-diaria.js'
import type { CompromisoParaPlanilla } from '../domain/compromisos-mes.js'
import { feriadosNacionales2026 } from '../domain/feriados-nacionales-2026.js'
import { fechaHoyArgentina } from '../domain/hoy.fechas.js'
import { getTipoCambioMes } from './tipo-cambio-mes.repository.js'

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
    moneda: normalizarMoneda(data.moneda),
    deudaTotalCentavos: null,
    cuotaNumero: null,
    cuotaTotal: null,
    observacion: null,
    pagos: listarPagos(data.pagos),
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
  const [rows, tipo] = await Promise.all([listAllCompromisos(), getTipoCambioMes(desde.slice(0, 7))])
  const compromisos = rows.flatMap((row) => {
    const mapeado = aCompromiso(row.id, row.data)
    return mapeado ? [mapeado] : []
  })
  return armarCargaDiaria({
    desde,
    dias,
    hoy,
    tipoCambio: tipo?.usdArs ?? null,
    feriados: feriadosNacionales2026(),
    compromisos,
  })
}
