/**
 * Escribe en compromisosPago los cheques de cartera propia (emitidos) pendientes de Vientri.
 * Solo toca documentos con origen 'vientri-cheque' (id "vientri-cheque-<clave>"); el resto no se toca.
 * Misma bandera que las facturas: vientriEstado/config.agenda.
 * Usa createCompromisoWithHistorial / appendCompromisoHistorial (mismas reglas que el alta/edición manual).
 * No escribe nada hacia Vientri (solo lectura).
 */
import { Timestamp } from 'firebase-admin/firestore'
import { dateKeyInArgentina } from '../../agenda/domain/vencimiento.alert.js'
import {
  appendCompromisoHistorial,
  COMPROMISOS_COLLECTION,
  createCompromisoWithHistorial,
  timestampFromDate,
} from '../../agenda/services/agenda.repository.js'
import { buildAgendaHistorialEntry } from '../../agenda/domain/agenda.historial.js'
import { adminDb } from '../../../../lib/firebase/admin.js'
import {
  ACTOR_VIENTRI,
  planAgendaCheques,
  type DatosChequeAgenda,
  type ExistenteChequeAgenda,
  type OperacionChequeAgenda,
} from '../domain/agenda-cheques.js'
import type { VientriChequeDoc } from '../domain/tipos.js'
import { agendaVientriActivada } from './sincronizar-agenda.js'

const ESTADOS_ABIERTOS = new Set(['pendiente', 'vencido', 'confeccionada_pendiente_autorizacion'])

const diaATimestamp = (ymd: string) => Timestamp.fromDate(new Date(`${ymd.slice(0, 10)}T12:00:00-03:00`))
const tsADia = (v: unknown): string | null => (v instanceof Timestamp ? dateKeyInArgentina(v.toDate()) : null)

async function leerExistentesCheques(): Promise<ExistenteChequeAgenda[]> {
  const snap = await adminDb().collection(COMPROMISOS_COLLECTION).where('origen', '==', 'vientri-cheque').get()
  return snap.docs.map((d) => {
    const x = d.data()
    const estado = String(x.estado ?? '')
    return {
      id: d.id,
      estado,
      anulado: x.anulado === true,
      fecha: tsADia(x.fechaVencimiento),
      fechaVientri: x.vientriCheque?.fechaVencimiento ?? null,
      montoCentavos: Number(x.montoCentavos) || 0,
      concepto: String(x.concepto ?? ''),
      proveedorONombre: String(x.proveedorONombre ?? ''),
      cerradoPorVientri:
        x.pagadoPor === ACTOR_VIENTRI ||
        (x.anulado === true && /Vientri/i.test(String(x.anuladoMotivo ?? ''))),
    }
  })
}

function bloqueVientriCheque(datos: DatosChequeAgenda, fechaDatos: string) {
  return {
    ...datos.vientriCheque,
    fechaDatos,
  }
}

export interface ConteoAgendaCheques {
  crear: number
  actualizar: number
  cerrarPagado: number
  cerrarAnulado: number
  reabrir: number
  sinFecha: number
}

export async function sincronizarAgendaCheques(opts: {
  chequesEnVentana: VientriChequeDoc[]
  todosLosCheques: VientriChequeDoc[]
  fechaDatos: string
  escribir: boolean
}): Promise<ConteoAgendaCheques> {
  const existentes = await leerExistentesCheques()
  const plan = planAgendaCheques({
    enVentana: opts.chequesEnVentana,
    todosEmitidos: opts.todosLosCheques.filter((c) => c.direccion === 'emitido'),
    existentes,
  })
  const conteo: ConteoAgendaCheques = {
    crear: 0,
    actualizar: 0,
    cerrarPagado: 0,
    cerrarAnulado: 0,
    reabrir: 0,
    sinFecha: plan.sinFecha,
  }
  for (const op of plan.operaciones) {
    if (op.tipo === 'crear') conteo.crear += 1
    else if (op.tipo === 'actualizar') conteo.actualizar += 1
    else if (op.tipo === 'reabrir') conteo.reabrir += 1
    else if (op.cierre === 'pagado') conteo.cerrarPagado += 1
    else conteo.cerrarAnulado += 1
  }
  if (opts.escribir) await aplicar(plan.operaciones, opts.fechaDatos)
  return conteo
}

/** Misma bandera que facturas; se exporta para tests/scripts. */
export { agendaVientriActivada }

async function aplicar(operaciones: OperacionChequeAgenda[], fechaDatos: string): Promise<void> {
  for (const op of operaciones) {
    if (op.tipo === 'crear') {
      await createCompromisoWithHistorial({
        id: op.id,
        usuario: ACTOR_VIENTRI,
        nota: `Cheque de Vientri: ${op.datos.concepto}`,
        doc: {
          concepto: op.datos.concepto,
          proveedorONombre: op.datos.proveedorONombre,
          montoCentavos: op.datos.montoCentavos,
          fechaVencimiento: diaATimestamp(op.datos.fecha),
          prioridad: 0,
          urgenciaManual: null,
          medioPago: 'cheque',
          chequeId: null,
          transferenciaConfeccionadaId: null,
          transferenciasEnFirma: [],
          estado: 'pendiente',
          esViatico: false,
          beneficiarioEmpleado: null,
          grupo: op.datos.grupo,
          moneda: 'ARS',
          deudaTotalCentavos: null,
          cuotaNumero: null,
          cuotaTotal: null,
          observacion: null,
          pagos: [],
          origen: 'vientri-cheque',
          vientriCheque: bloqueVientriCheque(op.datos, fechaDatos),
          createdBy: ACTOR_VIENTRI,
        },
      })
      continue
    }

    if (op.tipo === 'actualizar') {
      const patch: Record<string, unknown> = {
        concepto: op.datos.concepto,
        proveedorONombre: op.datos.proveedorONombre,
        montoCentavos: op.datos.montoCentavos,
        medioPago: 'cheque',
        grupo: op.datos.grupo,
        vientriCheque: bloqueVientriCheque(op.datos, fechaDatos),
      }
      if (op.cambiarFecha) patch.fechaVencimiento = diaATimestamp(op.datos.fecha)
      await appendCompromisoHistorial({
        compromisoId: op.id,
        historial: buildAgendaHistorialEntry({
          estadoAnterior: 'pendiente',
          estadoNuevo: 'pendiente',
          usuario: ACTOR_VIENTRI,
          nota: 'Actualizado desde Vientri (cheque)',
        }),
        patch: patch as never,
      })
      continue
    }

    if (op.tipo === 'reabrir') {
      await appendCompromisoHistorial({
        compromisoId: op.id,
        historial: buildAgendaHistorialEntry({
          estadoAnterior: 'pagado',
          estadoNuevo: 'pendiente',
          usuario: ACTOR_VIENTRI,
          nota: 'Vuelve a pendiente en Vientri (cheque)',
        }),
        patch: {
          concepto: op.datos.concepto,
          proveedorONombre: op.datos.proveedorONombre,
          montoCentavos: op.datos.montoCentavos,
          fechaVencimiento: diaATimestamp(op.datos.fecha),
          medioPago: 'cheque',
          grupo: op.datos.grupo,
          estado: 'pendiente',
          fechaPago: null,
          pagadoPor: null,
          anulado: false,
          anuladoAt: null,
          anuladoMotivo: null,
          vientriCheque: bloqueVientriCheque(op.datos, fechaDatos),
        },
      })
      continue
    }

    // cerrar
    if (op.cierre === 'pagado') {
      const fecha = diaATimestamp(fechaDatos)
      await appendCompromisoHistorial({
        compromisoId: op.id,
        historial: buildAgendaHistorialEntry({
          estadoAnterior: 'pendiente',
          estadoNuevo: 'pagado',
          usuario: ACTOR_VIENTRI,
          nota: op.motivo,
        }),
        patch: {
          estado: 'pagado',
          fechaPago: fecha,
          pagadoPor: ACTOR_VIENTRI,
        },
      })
    } else {
      await appendCompromisoHistorial({
        compromisoId: op.id,
        historial: buildAgendaHistorialEntry({
          estadoAnterior: 'pendiente',
          estadoNuevo: 'pendiente',
          usuario: ACTOR_VIENTRI,
          nota: op.motivo,
        }),
        patch: {
          anulado: true,
          anuladoAt: timestampFromDate(new Date()),
          anuladoMotivo: op.motivo,
        },
      })
    }
  }
}

/** Detecta si un compromiso abierto sigue siendo "abierto" (helper de tests). */
export function compromisoChequeAbierto(estado: string, anulado?: boolean): boolean {
  return anulado !== true && ESTADOS_ABIERTOS.has(estado)
}
