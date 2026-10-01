import { dateKeyInArgentina } from '../domain/vencimiento.alert.js'
import { agendaTimestampToDate } from '../domain/agendaTimestamps.js'
import type { CompromisoPagoDocument, MedioPago, MonedaCompromiso } from '../domain/agenda.types.js'
import { normalizarCuota, normalizarMoneda } from '../domain/compromiso-campos.js'
import { listarPagos } from '../domain/pago-compromiso.js'
import {
  catalogoVacio,
  ordenarRenglones,
  recolectarIds,
  renglonesDeCompromiso,
  renglonesEnRango,
  resolverRangoPagos,
  transferenciaEsperaFirma,
  type CatalogoPagos,
  type FuentePago,
} from '../domain/como-se-pago.js'
import { getChequeById } from '../../cheques/services/cheques.repository.js'
import { listCajasDocs } from '../../cajachica/services/caja.repository.js'
import { listCuentaDocuments } from '../../services/cuentas.repository.js'
import { presentarEstadoInterbanking } from '../../transferencias/domain/estado-interbanking.js'
import { getTransferenciaDocument } from '../../transferencias/services/transferencias.repository.js'
import { movimientosBancariosCollection } from '../../movimientos/services/movimientos.repository.js'
import { listAllCompromisos } from './agenda.repository.js'

export class PagosHechosError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export interface PagoHechoApi {
  compromisoId: string
  fecha: string
  proveedorONombre: string
  concepto: string
  cuota: string | null
  montoCentavos: number
  moneda: MonedaCompromiso
  medio: MedioPago
  comoSePago: string
  link: string | null
}

function dia(value: unknown): string | null {
  const date = agendaTimestampToDate(value)
  return date ? dateKeyInArgentina(date) : null
}

function medioDe(value: unknown): MedioPago {
  if (value === 'efectivo' || value === 'cheque' || value === 'transferencia') return value
  return 'transferencia'
}

function texto(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function fuenteDeCompromiso(id: string, data: CompromisoPagoDocument): FuentePago | null {
  const fechaVencimiento = dia(data.fechaVencimiento)
  const fechaPago = dia(data.fechaPago)
  if (!fechaVencimiento && !fechaPago) return null
  const cuota = normalizarCuota(data.cuotaNumero, data.cuotaTotal)
  return {
    id,
    concepto: texto(data.concepto),
    proveedorONombre: texto(data.proveedorONombre),
    montoCentavos: data.montoCentavos,
    moneda: normalizarMoneda(data.moneda),
    estado: data.estado,
    medioPago: medioDe(data.medioPago),
    fechaPago,
    fechaVencimiento: fechaVencimiento ?? fechaPago ?? '',
    chequeId: data.chequeId ?? null,
    cuentaId: data.cuentaId ?? null,
    transferenciaConfeccionadaId: data.transferenciaConfeccionadaId ?? null,
    cuotaNumero: cuota.cuotaNumero,
    cuotaTotal: cuota.cuotaTotal,
    pagos: listarPagos(data.pagos),
  }
}

async function mapaPorIds<T>(ids: readonly string[], leer: (id: string) => Promise<T | null>): Promise<Map<string, T>> {
  const mapa = new Map<string, T>()
  const unicos = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  const tamano = 25
  for (let i = 0; i < unicos.length; i += tamano) {
    const parte = unicos.slice(i, i + tamano)
    const filas = await Promise.all(parte.map(async (id) => ({ id, valor: await leer(id) })))
    for (const fila of filas) {
      if (fila.valor != null) mapa.set(fila.id, fila.valor)
    }
  }
  return mapa
}

async function leerMovimiento(id: string): Promise<{ fecha: string; banco: string | null } | null> {
  const snap = await movimientosBancariosCollection().doc(id).get()
  if (!snap.exists) return null
  const data = snap.data() as { fechaProceso?: unknown; bancoNombre?: unknown }
  const cruda = typeof data.fechaProceso === 'string' ? data.fechaProceso.slice(0, 10) : ''
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(cruda) ? cruda : ''
  const banco = typeof data.bancoNombre === 'string' && data.bancoNombre.trim() ? data.bancoNombre.trim() : null
  if (!fecha && !banco) return null
  return { fecha, banco }
}

async function nombresCajas(): Promise<Map<string, string>> {
  const rows = await listCajasDocs()
  const mapa = new Map<string, string>()
  for (const row of rows) {
    const nombre = row.data.nombre?.trim()
    if (nombre) mapa.set(row.id, nombre)
  }
  return mapa
}

async function nombresCuentas(): Promise<Map<string, string>> {
  const rows = await listCuentaDocuments()
  const mapa = new Map<string, string>()
  for (const row of rows) {
    const banco = row.data.bancoNombre?.trim()
    if (banco) mapa.set(row.id, banco)
  }
  return mapa
}

/** Nombres de cajas, cheques, cuentas y transferencias, leídos de a varios. */
export async function cargarCatalogo(fuentes: readonly FuentePago[]): Promise<CatalogoPagos> {
  const ids = recolectarIds(fuentes)
  const hayAlgo =
    ids.chequeIds.length > 0 ||
    ids.transferenciaIds.length > 0 ||
    ids.movimientoIds.length > 0 ||
    ids.necesitaCajas ||
    ids.necesitaCuentas
  if (!hayAlgo) return catalogoVacio()

  const [cheques, transferenciasCrudas, movimientos, cajas, cuentas] = await Promise.all([
    mapaPorIds(ids.chequeIds, async (id) => {
      const cheque = await getChequeById(id)
      if (!cheque) return null
      const numero = cheque.numero.trim()
      const banco = cheque.bancoEmisor?.trim() || null
      return {
        numero,
        banco,
        propio: cheque.direccion === 'emitido' || cheque.origen === 'propio',
      }
    }),
    mapaPorIds(ids.transferenciaIds, (id) => getTransferenciaDocument(id)),
    mapaPorIds(ids.movimientoIds, leerMovimiento),
    ids.necesitaCajas ? nombresCajas() : Promise.resolve(new Map<string, string>()),
    ids.necesitaCuentas ? nombresCuentas() : Promise.resolve(new Map<string, string>()),
  ])

  const faltantes = ids.transferenciaIds.filter((id) => !transferenciasCrudas.has(id) && !movimientos.has(id))
  const extra = await mapaPorIds(faltantes, leerMovimiento)
  for (const [id, movimiento] of extra) movimientos.set(id, movimiento)

  const transferencias = new Map<string, { banco: string | null; esperandoFirma: boolean }>()
  for (const [id, doc] of transferenciasCrudas) {
    const presentacion = presentarEstadoInterbanking({
      estado: doc.data.estadoInterbanking,
      fechaSolicitud: doc.data.fechaSolicitudInterbanking ?? null,
    })
    transferencias.set(id, {
      banco: cuentas.get(doc.data.cuentaDebitoId) ?? null,
      esperandoFirma: transferenciaEsperaFirma({
        estado: doc.data.estado,
        tono: presentacion?.tono ?? null,
      }),
    })
  }

  return { cheques, cajas, cuentas, transferencias, movimientos }
}

export async function listarPagosHechos(query: {
  mes?: unknown
  desde?: unknown
  hasta?: unknown
}): Promise<{ desde: string; hasta: string; pagos: PagoHechoApi[] }> {
  const rango = resolverRangoPagos(query)
  if (!rango.ok) throw new PagosHechosError(rango.error, 400)
  const rows = await listAllCompromisos()
  const fuentes = rows.flatMap((row) => {
    const fuente = fuenteDeCompromiso(row.id, row.data)
    return fuente ? [fuente] : []
  })
  const catalogo = await cargarCatalogo(fuentes)
  const renglones = ordenarRenglones(
    renglonesEnRango(
      fuentes.flatMap((fuente) => renglonesDeCompromiso(fuente, catalogo)),
      rango.desde,
      rango.hasta,
    ),
  )
  return {
    desde: rango.desde,
    hasta: rango.hasta,
    pagos: renglones.map((renglon) => ({
      compromisoId: renglon.compromisoId,
      fecha: renglon.fecha,
      proveedorONombre: renglon.proveedorONombre,
      concepto: renglon.concepto,
      cuota: renglon.cuota,
      montoCentavos: renglon.montoCentavos,
      moneda: renglon.moneda,
      medio: renglon.medio,
      comoSePago: renglon.comoSePago,
      link: renglon.link,
    })),
  }
}
