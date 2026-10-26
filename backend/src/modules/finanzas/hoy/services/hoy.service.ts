import { agendaTimestampToDate, agendaTimestampToIso } from '../../agenda/domain/agendaTimestamps.js'
import { listarPagos } from '../../agenda/domain/pago-compromiso.js'
import { faltaPagarCentavos, listarTransferenciasEnFirma } from '../domain/transferencia-en-firma.js'
import { parsePrioridadUrgencia } from '../../agenda/domain/agenda.prioridad.js'
import type { CobroEsperadoDocument, CompromisoPagoDocument, MedioPago } from '../../agenda/domain/agenda.types.js'
import { listAllCobros, listAllCompromisos } from '../../agenda/services/agenda.repository.js'
import { dateKeyInArgentina } from '../../agenda/domain/vencimiento.alert.js'
import { movimientosBancariosCollection } from '../../movimientos/services/movimientos.repository.js'
import type { MovimientoBancarioDocument } from '../../movimientos/domain/movimiento-bancario.types.js'
import { listCuentaDocuments } from '../../services/cuentas.repository.js'
import { presentarEstadoInterbanking } from '../../transferencias/domain/estado-interbanking.js'
import { listTransferenciasConfeccionadas } from '../../transferencias/services/transferencias.repository.js'
import { marcarCompromisoPagadoPorTransferenciaHecha } from '../../agenda/services/compromisos.service.js'
import { esChequeEnCartera, ordenarCartera } from '../domain/cheques-hoy.js'
import { fechaHoyArgentina, proximosDiasHabiles, sumarDias } from '../domain/hoy.fechas.js'
import type {
  ChequeCarteraHoy,
  ChequeEnHoy,
  CobroHoy,
  CompromisoHoy,
  CuentaHoy,
  HoyVista,
  MovimientoHoy,
  TransferenciaHoy,
} from '../domain/hoy.tipos.js'
import {
  countChequesFiltrados,
  pageCheques,
  type ChequesFiltro,
  type ChequeListadoItem,
} from '../../cheques/services/cheques.repository.js'
import { armarVistaHoy } from '../domain/hoy.vista.js'
import { hayDatosDemo } from './hoy.demo.js'

function diaDe(value: unknown): string | null {
  const date = agendaTimestampToDate(value)
  return date ? dateKeyInArgentina(date) : null
}

function textoOpcional(data: object, key: string): string | null {
  const value = (data as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function medioDe(value: MedioPago | undefined): CompromisoHoy['medioPago'] {
  if (value === 'efectivo' || value === 'cheque' || value === 'transferencia') return value
  return 'transferencia'
}

function mapCompromiso(id: string, data: CompromisoPagoDocument): CompromisoHoy | null {
  const fechaVencimiento = diaDe(data.fechaVencimiento)
  if (!fechaVencimiento) return null
  if (
    data.estado !== 'pendiente' &&
    data.estado !== 'vencido' &&
    data.estado !== 'confeccionada_pendiente_autorizacion' &&
    data.estado !== 'pagado'
  ) {
    return null
  }
  return {
    id,
    concepto: data.concepto,
    proveedorONombre: data.proveedorONombre,
    montoCentavos: faltaPagarCentavos({
      estado: data.estado,
      montoCentavos: data.montoCentavos,
      pagos: listarPagos(data.pagos),
      transferenciasEnFirma: listarTransferenciasEnFirma(data.transferenciasEnFirma),
    }),
    fechaVencimiento,
    urgencia: parsePrioridadUrgencia(data.urgenciaManual),
    medioPago: medioDe(data.medioPago),
    estado: data.estado,
    cuentaId: data.cuentaId ?? null,
    sinFecha:
      data.vientri?.sinFechaDePago === true && data.vientri.fechaEstimada !== true && fechaVencimiento === data.vientri.fechaVencimiento,
    estimada: data.vientri?.fechaEstimada === true && fechaVencimiento === data.vientri.fechaVencimiento,
  }
}

function mapCobro(id: string, data: CobroEsperadoDocument): CobroHoy | null {
  const fechaEsperada = diaDe(data.fechaEsperada)
  if (!fechaEsperada) return null
  if (data.estado !== 'esperado' && data.estado !== 'confirmado' && data.estado !== 'incobrable') {
    return null
  }
  return {
    id,
    clienteONombre: data.clienteONombre,
    concepto: textoOpcional(data, 'concepto'),
    montoCentavos: data.montoCentavos,
    fechaEsperada,
    estado: data.estado,
    cuit: textoOpcional(data, 'cuit'),
    email: textoOpcional(data, 'email'),
    contraparte: textoOpcional(data, 'contraparte'),
    sinFecha: data.vientri?.sinFechaDePago === true && data.vientri.fechaEstimada !== true && fechaEsperada === data.vientri.fechaVencimiento,
    estimada: data.vientri?.fechaEstimada === true && fechaEsperada === data.vientri.fechaVencimiento,
  }
}

function mapMovimiento(id: string, data: MovimientoBancarioDocument): MovimientoHoy | null {
  if (data.tipo !== 'debito' && data.tipo !== 'credito') return null
  if (typeof data.montoCentavos !== 'number') return null
  return {
    id,
    cuentaId: data.cuentaId,
    bancoNombre: data.bancoNombre,
    tipo: data.tipo,
    montoCentavos: data.montoCentavos,
    fechaProceso: data.fechaProceso,
    customerCuit: data.customerCuit ?? null,
    depositorDescription: data.depositorDescription ?? null,
    descripcion: data.descripcion ?? '',
    reservado: Boolean(data.reservadoPorTransferenciaId),
  }
}

const FILTRO_CHEQUE_VACIO: Omit<ChequesFiltro, 'direccion' | 'desde' | 'hasta'> = {
  origen: null,
  estado: null,
  tipo: null,
  vinculacion: null,
  comprobante: null,
  q: null,
}

async function listarCheques(filtro: ChequesFiltro): Promise<ChequeListadoItem[]> {
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

function mapCheque(row: ChequeListadoItem): ChequeEnHoy {
  return {
    id: row.id,
    numero: row.numero,
    direccion: row.direccion,
    estado: row.estado,
    utilizado: row.utilizado,
    montoCentavos: row.montoCentavos,
    fechaPago: row.fechaPago,
    bancoEmisor: row.bancoEmisor,
    destinatario: row.destinatario,
    emisor: row.emisor,
    cliente: row.cliente,
  }
}

async function listarMovimientos(desde: string, hasta: string): Promise<MovimientoHoy[]> {
  const snap = await movimientosBancariosCollection()
    .where('fechaProceso', '>=', desde)
    .where('fechaProceso', '<=', hasta)
    .get()
  const rows: MovimientoHoy[] = []
  for (const doc of snap.docs) {
    const mapped = mapMovimiento(doc.id, doc.data() as MovimientoBancarioDocument)
    if (mapped) rows.push(mapped)
  }
  return rows
}

export async function getMovimientoHoy(id: string): Promise<MovimientoHoy | null> {
  const snap = await movimientosBancariosCollection().doc(id).get()
  if (!snap.exists) return null
  return mapMovimiento(snap.id, snap.data() as MovimientoBancarioDocument)
}

/** Cierra pagos cuya transferencia ya quedó hecha, sin consultar al banco. */
export async function cerrarCompromisosConTransferenciaHecha(actorUid: string, now = new Date()): Promise<void> {
  const rows = await listTransferenciasConfeccionadas()
  for (const row of rows) {
    const compromisoId = row.data.compromisoPagoId?.trim() ?? ''
    if (!compromisoId) continue
    if (row.data.estado === 'rechazada' || row.data.estado === 'cancelada') continue
    const presentacion = presentarEstadoInterbanking({
      estado: row.data.estadoInterbanking,
      fechaSolicitud: row.data.fechaSolicitudInterbanking ?? null,
      now,
    })
    if (presentacion?.tono !== 'hecha') continue
    await marcarCompromisoPagadoPorTransferenciaHecha({
      compromisoId,
      actorUid,
      cuentaId: row.data.cuentaDebitoId,
      nota: 'La transferencia quedó hecha en el banco.',
      transferenciaId: row.id,
      montoCentavos: row.data.montoCentavos,
    })
  }
}

export async function armarHoy(input: { actorUid: string; now?: Date }): Promise<HoyVista & { hayDatosDemo: boolean }> {
  const now = input.now ?? new Date()
  await cerrarCompromisosConTransferenciaHecha(input.actorUid, now)
  const hoy = fechaHoyArgentina(now)
  const hastaSemana = proximosDiasHabiles(hoy, 7).at(-1) ?? hoy
  const [compromisos, cobros, cuentas, transferencias, movimientos, chequesEmitidos, datosDemo] = await Promise.all([
    listAllCompromisos(),
    listAllCobros(),
    listCuentaDocuments(),
    listTransferenciasConfeccionadas(),
    listarMovimientos(sumarDias(hoy, -4), hoy),
    listarCheques({
      ...FILTRO_CHEQUE_VACIO,
      direccion: 'emitido',
      desde: hoy,
      hasta: hastaSemana,
    }),
    // Si la consulta falla, la franja DEMO no se muestra; el día se arma igual.
    hayDatosDemo().catch((err: unknown) => {
      console.error('[finanzas/hoy] hayDatosDemo', err)
      return false
    }),
  ])

  const cuentasHoy: CuentaHoy[] = cuentas
    .filter((row) => row.data.tipo === 'CC' || row.data.tipo === 'USD')
    .map((row) => ({
      id: row.id,
      bancoNombre: row.data.bancoNombre,
      tipo: row.data.tipo,
      moneda: row.data.moneda,
      saldoActualCentavos: row.data.saldoActualCentavos,
      descubiertoCentavos: row.data.descubiertoCentavos,
    }))

  const transferenciasHoy: TransferenciaHoy[] = transferencias.map((row) => ({
    id: row.id,
    montoCentavos: row.data.montoCentavos,
    estado: row.data.estado,
    estadoInterbanking: row.data.estadoInterbanking ?? null,
    estadoInterbankingActualizadoAt: agendaTimestampToIso(row.data.estadoInterbankingActualizadoAt),
    fechaConfeccion: agendaTimestampToIso(row.data.fechaConfeccion),
    fechaSolicitud: row.data.fechaSolicitudInterbanking ?? null,
  }))

  const vista = armarVistaHoy({
    now,
    compromisos: compromisos.flatMap((row) => {
      const mapped = mapCompromiso(row.id, row.data)
      return mapped ? [mapped] : []
    }),
    cobros: cobros.flatMap((row) => {
      const mapped = mapCobro(row.id, row.data)
      return mapped ? [mapped] : []
    }),
    movimientos,
    cuentas: cuentasHoy,
    transferencias: transferenciasHoy,
    cheques: chequesEmitidos.map(mapCheque),
  })
  return { ...vista, hayDatosDemo: datosDemo }
}

/** Cheques recibidos que se pueden usar para pagar, del más parecido al monto al más lejano. */
export async function listarChequesEnCartera(montoCentavos: number): Promise<ChequeCarteraHoy[]> {
  const rows = await listarCheques({
    ...FILTRO_CHEQUE_VACIO,
    direccion: 'recibido',
    desde: null,
    hasta: null,
  })
  const enCartera = rows.filter(esChequeEnCartera).map((row) => ({
    id: row.id,
    numero: row.numero,
    emisor: row.emisor.trim() || 'Sin emisor',
    banco: row.bancoEmisor?.trim() || 'Sin banco',
    fechaPago: row.fechaPago,
    montoCentavos: row.montoCentavos,
  }))
  return ordenarCartera(enCartera, montoCentavos)
}
