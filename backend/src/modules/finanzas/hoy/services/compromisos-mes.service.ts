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
import { nombresNormalizadosProveedoresFinancieros } from '../../agenda/services/proveedores-financieros.repository.js'
import {
  countChequesFiltrados,
  pageCheques,
  type ChequesFiltro,
  type ChequeListadoItem,
} from '../../cheques/services/cheques.repository.js'
import {
  agregarChequesSueltos,
  armarPlanillaMes,
  diasDelMes,
  parseMes,
  type CompromisoParaPlanilla,
  type PlanillaMes,
} from '../domain/compromisos-mes.js'
import { chequeEmitidoVigente } from '../domain/cheques-hoy.js'
import { feriadosNacionales2026 } from '../domain/feriados-nacionales-2026.js'
import { fechaHoyArgentina } from '../domain/hoy.fechas.js'
import type { OrigenCompromisoHoy } from '../domain/hoy.tipos.js'
import { getTipoCambioMes, putTipoCambioMes, type TipoCambioMes } from './tipo-cambio-mes.repository.js'

const FILTRO_CHEQUE_EMITIDO_VACIO: Omit<ChequesFiltro, 'direccion' | 'desde' | 'hasta'> = {
  origen: null,
  estado: null,
  tipo: null,
  vinculacion: null,
  comprobante: null,
  q: null,
}

async function listarChequesEmitidosDelMes(desde: string, hasta: string): Promise<ChequeListadoItem[]> {
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

function origenDe(value: string | undefined): OrigenCompromisoHoy {
  return value === 'vientri' || value === 'vientri-cheque' || value === 'inversiones' || value === 'planilla' ? value : 'manual'
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
    origen: origenDe(data.origen),
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
    vientriChequeNumero: data.vientriCheque?.numero ?? null,
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
  const dias = diasDelMes(mes)
  const desdeMes = dias[0]
  const hastaMes = dias.at(-1) ?? desdeMes
  const [rows, tipo, proveedoresFinancieros, chequesDelMes] = await Promise.all([
    listAllCompromisos(),
    getTipoCambioMes(mes),
    nombresNormalizadosProveedoresFinancieros(),
    desdeMes && hastaMes ? listarChequesEmitidosDelMes(desdeMes, hastaMes) : Promise.resolve([]),
  ])
  const bases = rows.flatMap((row) => {
    const mapped = aPlanilla(row.id, row.data)
    return mapped ? [mapped] : []
  })
  const basesConCheques = agregarChequesSueltos(
    bases,
    chequesDelMes.filter((cheque) => chequeEmitidoVigente(cheque)),
  )
  const catalogo = await cargarCatalogo(basesConCheques.map(fuenteDe))
  const compromisos = basesConCheques.map((row) => ({
    ...row,
    pagosResumen: lineasPagosPlanilla(fuenteDe(row), catalogo),
  }))
  const planilla = armarPlanillaMes({
    mes,
    hoy: fechaHoyArgentina(now),
    tipoCambio: tipo?.usdArs ?? null,
    feriados: feriadosNacionales2026(),
    compromisos,
    proveedoresFinancieros,
  })
  for (const grupo of planilla.grupos) {
    for (const fila of grupo.filas) {
      fila.chequeAsignado = fila.chequeId ? (catalogo.cheques.get(fila.chequeId) ?? null) : null
    }
  }
  return planilla
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
