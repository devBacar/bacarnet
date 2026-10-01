import { dateKeyInArgentina } from '../../agenda/domain/vencimiento.alert.js'
import { normalizarCuota, normalizarGrupo, normalizarMoneda, normalizarObservacion, normalizarCentavosOpcional } from '../../agenda/domain/compromiso-campos.js'
import type { CompromisoPagoDocument, MedioPago } from '../../agenda/domain/agenda.types.js'
import { lineasPagosPlanilla, type FuentePago } from '../../agenda/domain/como-se-pago.js'
import { listarPagos } from '../../agenda/domain/pago-compromiso.js'
import { listarTransferenciasEnFirma, montoEnFirmaCentavos } from '../domain/transferencia-en-firma.js'
import { agendaTimestampToDate } from '../../agenda/domain/agendaTimestamps.js'
import { listAllCompromisos } from '../../agenda/services/agenda.repository.js'
import { cargarCatalogo } from '../../agenda/services/pagos-hechos.service.js'
import {
  createCompromisoAgenda,
  patchCompromisoAgenda,
} from '../../agenda/services/compromisos.service.js'
import { armarPlanillaMes, parseMes, type CompromisoParaPlanilla, type PlanillaMes } from '../domain/compromisos-mes.js'
import { feriadosNacionales2026 } from '../domain/feriados-nacionales-2026.js'
import { fechaHoyArgentina } from '../domain/hoy.fechas.js'
import { getTipoCambioMes, putTipoCambioMes, type TipoCambioMes } from './tipo-cambio-mes.repository.js'

export class CompromisoMesError extends Error {
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
  if (value === 'efectivo' || value === 'cheque' || value === 'transferencia') return value
  return 'transferencia'
}

function aPlanilla(id: string, data: CompromisoPagoDocument): CompromisoParaPlanilla | null {
  const fechaVencimiento = dia(data.fechaVencimiento)
  if (!fechaVencimiento) return null
  if (typeof data.montoCentavos !== 'number' || data.montoCentavos <= 0) return null
  const cuota = normalizarCuota(data.cuotaNumero, data.cuotaTotal)
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
    deudaTotalCentavos: normalizarCentavosOpcional(data.deudaTotalCentavos),
    cuotaNumero: cuota.cuotaNumero,
    cuotaTotal: cuota.cuotaTotal,
    observacion: normalizarObservacion(data.observacion),
    pagos: listarPagos(data.pagos),
    enFirmaCentavos: montoEnFirmaCentavos(listarTransferenciasEnFirma(data.transferenciasEnFirma)),
    chequeId: data.chequeId ?? null,
    cuentaId: data.cuentaId ?? null,
    transferenciaConfeccionadaId: data.transferenciaConfeccionadaId ?? null,
  }
}

function fuenteDe(row: CompromisoParaPlanilla): FuentePago {
  return {
    id: row.id,
    concepto: row.concepto,
    proveedorONombre: row.proveedorONombre,
    montoCentavos: row.montoCentavos,
    moneda: row.moneda,
    estado: row.estado,
    medioPago: row.medioPago,
    fechaPago: row.fechaPago,
    fechaVencimiento: row.fechaVencimiento,
    chequeId: row.chequeId ?? null,
    cuentaId: row.cuentaId ?? null,
    transferenciaConfeccionadaId: row.transferenciaConfeccionadaId ?? null,
    cuotaNumero: row.cuotaNumero,
    cuotaTotal: row.cuotaTotal,
    pagos: row.pagos,
  }
}

export async function getPlanillaCompromisosMes(mes: string, now = new Date()): Promise<PlanillaMes> {
  if (!parseMes(mes)) throw new CompromisoMesError('Indicá el mes con formato AAAA-MM', 400)
  const [rows, tipo] = await Promise.all([listAllCompromisos(), getTipoCambioMes(mes)])
  const bases = rows.flatMap((row) => {
    const mapped = aPlanilla(row.id, row.data)
    return mapped ? [mapped] : []
  })
  const catalogo = await cargarCatalogo(bases.map(fuenteDe))
  const compromisos = bases.map((row) => ({
    ...row,
    pagosResumen: lineasPagosPlanilla(fuenteDe(row), catalogo),
  }))
  return armarPlanillaMes({
    mes,
    hoy: fechaHoyArgentina(now),
    tipoCambio: tipo?.usdArs ?? null,
    feriados: feriadosNacionales2026(),
    compromisos,
  })
}

export async function leerTipoCambioMes(mes: string): Promise<TipoCambioMes | { mes: string; usdArs: null }> {
  if (!parseMes(mes)) throw new CompromisoMesError('Indicá el mes con formato AAAA-MM', 400)
  const tipo = await getTipoCambioMes(mes)
  return tipo ?? { mes, usdArs: null }
}

export async function guardarTipoCambioMes(input: {
  mes: string
  usdArs: unknown
  actorUid: string
}): Promise<{ mes: string; usdArs: number }> {
  if (!parseMes(input.mes)) throw new CompromisoMesError('Indicá el mes con formato AAAA-MM', 400)
  if (typeof input.usdArs !== 'number' || !Number.isFinite(input.usdArs) || input.usdArs <= 0) {
    throw new CompromisoMesError('El tipo de cambio tiene que ser mayor a cero', 400)
  }
  const usdArs = Math.round(input.usdArs * 10_000) / 10_000
  await putTipoCambioMes(input.mes, usdArs, input.actorUid)
  return { mes: input.mes, usdArs }
}

export async function crearCompromisoMes(input: { actorUid: string; body: Record<string, unknown> }) {
  return createCompromisoAgenda(input)
}

export async function editarCompromisoMes(input: {
  compromisoId: string
  actorUid: string
  body: Record<string, unknown>
}) {
  return patchCompromisoAgenda(input.compromisoId, input.actorUid, input.body)
}
