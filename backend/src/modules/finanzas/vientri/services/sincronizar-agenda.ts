/**
 * Escribe en la Agenda (compromisosPago / cobrosEsperados) las facturas pendientes de Vientri.
 * Solo toca documentos con origen 'vientri' (id "vientri-<clave>"); los cargados a mano no se tocan.
 * Se activa con vientriEstado/config.agenda = true (scripts/vientri-agenda.mjs).
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { COBROS_COLLECTION, COMPROMISOS_COLLECTION } from '../../agenda/services/agenda.repository.js'
import { dateKeyInArgentina } from '../../agenda/domain/vencimiento.alert.js'
import {
  ACTOR_VIENTRI,
  planAgenda,
  type DatosVientriAgenda,
  type ExistenteAgenda,
  type LadoAgenda,
  type ManualAgenda,
  type OperacionAgenda,
  type PosibleDuplicado,
} from '../domain/agenda.js'
import type { PlazosHistoricos } from '../domain/plazos.js'
import type { VientriPendienteDoc } from '../domain/tipos.js'
import { VIENTRI_ESTADO } from './vientri.repository.js'

const HISTORIAL_SUB = 'historialEstados'
const ESTADOS_ABIERTOS_PAGO = new Set(['pendiente', 'vencido', 'confeccionada_pendiente_autorizacion'])

export async function agendaVientriActivada(): Promise<boolean> {
  const snap = await adminDb().collection(VIENTRI_ESTADO).doc('config').get()
  return snap.exists && snap.get('agenda') === true
}

const diaATimestamp = (ymd: string) => Timestamp.fromDate(new Date(`${ymd.slice(0, 10)}T12:00:00-03:00`))
const tsADia = (v: unknown): string | null => (v instanceof Timestamp ? dateKeyInArgentina(v.toDate()) : null)

async function leerExistentes(lado: LadoAgenda): Promise<Array<ExistenteAgenda & { estado: string }>> {
  const coleccion = lado === 'pagar' ? COMPROMISOS_COLLECTION : COBROS_COLLECTION
  const snap = await adminDb().collection(coleccion).where('origen', '==', 'vientri').get()
  return snap.docs.map((d) => {
    const x = d.data()
    const estado = String(x.estado ?? '')
    return lado === 'pagar'
      ? {
          id: d.id,
          estado,
          abierto: ESTADOS_ABIERTOS_PAGO.has(estado),
          cerradoPorVientri: x.pagadoPor === ACTOR_VIENTRI,
          fecha: tsADia(x.fechaVencimiento),
          fechaVientri: x.vientri?.fechaVencimiento ?? null,
          montoCentavos: Number(x.montoCentavos) || 0,
          concepto: String(x.concepto ?? ''),
          nombre: String(x.proveedorONombre ?? ''),
          moneda: x.moneda ?? 'ARS',
          sinFecha: x.vientri?.sinFechaDePago ?? null,
          fechaEstimada: x.vientri?.fechaEstimada ?? null,
        }
      : {
          id: d.id,
          estado,
          abierto: estado === 'esperado',
          cerradoPorVientri: x.confirmadoPor === ACTOR_VIENTRI,
          fecha: tsADia(x.fechaEsperada),
          fechaVientri: x.vientri?.fechaVencimiento ?? null,
          montoCentavos: Number(x.montoCentavos) || 0,
          concepto: String(x.vientri?.comprobante ?? ''),
          nombre: String(x.clienteONombre ?? ''),
          moneda: x.moneda ?? 'ARS',
          sinFecha: x.vientri?.sinFechaDePago ?? null,
          fechaEstimada: x.vientri?.fechaEstimada ?? null,
        }
  })
}

async function leerManuales(lado: LadoAgenda): Promise<ManualAgenda[]> {
  const coleccion = lado === 'pagar' ? COMPROMISOS_COLLECTION : COBROS_COLLECTION
  const snap = await adminDb().collection(coleccion).get()
  return snap.docs
    .filter((d) => d.get('origen') !== 'vientri')
    .map((d) => {
      const x = d.data()
      const nombre = String(x.proveedorONombre ?? x.clienteONombre ?? '')
      return {
        id: d.id,
        fecha: tsADia(lado === 'pagar' ? x.fechaVencimiento : x.fechaEsperada),
        montoCentavos: Number(x.montoCentavos) || 0,
        descripcion: [x.concepto, nombre].filter(Boolean).join(' - '),
      }
    })
}

function camposVientri(lado: LadoAgenda, datos: DatosVientriAgenda, fechaDatos: string) {
  const vientri = { ...datos.vientri, fechaDatos }
  return lado === 'pagar'
    ? { concepto: datos.concepto, proveedorONombre: datos.nombre, montoCentavos: datos.montoCentavos, moneda: datos.moneda, vientri }
    : { clienteONombre: datos.nombre, montoCentavos: datos.montoCentavos, moneda: datos.moneda, vientri }
}

function documentoNuevo(lado: LadoAgenda, datos: DatosVientriAgenda, fechaDatos: string, duplicado: PosibleDuplicado | null) {
  const ahora = FieldValue.serverTimestamp()
  const comunes = {
    origen: 'vientri',
    posibleDuplicado: duplicado,
    createdAt: ahora,
    updatedAt: ahora,
    createdBy: ACTOR_VIENTRI,
  }
  if (lado === 'pagar') {
    return {
      ...camposVientri(lado, datos, fechaDatos),
      ...comunes,
      fechaVencimiento: diaATimestamp(datos.fecha),
      prioridad: 0,
      urgenciaManual: null,
      medioPago: 'transferencia',
      chequeId: null,
      transferenciaConfeccionadaId: null,
      estado: 'pendiente',
      cuentaId: null,
      fechaPago: null,
      pagadoPor: null,
      esViatico: false,
      beneficiarioEmpleado: null,
      grupo: datos.grupo,
      deudaTotalCentavos: null,
      cuotaNumero: null,
      cuotaTotal: null,
      observacion: null,
      pagos: [],
    }
  }
  return {
    ...camposVientri(lado, datos, fechaDatos),
    ...comunes,
    fechaEsperada: diaATimestamp(datos.fecha),
    prioridad: 0,
    urgenciaManual: null,
    chequeId: null,
    estado: 'esperado',
    cuentaId: null,
    fechaConfirmado: null,
    confirmadoPor: null,
  }
}

export interface ConteoAgenda {
  crear: number
  actualizar: number
  cerrar: number
  reabrir: number
  saldosNegativos: number
  posiblesDuplicados: number
  residuos: number
}

export async function sincronizarAgenda(opts: {
  pendientesEnVentana: VientriPendienteDoc[]
  todosLosPendientes: VientriPendienteDoc[]
  fechaDatos: string
  escribir: boolean
  plazos?: PlazosHistoricos
}): Promise<Record<LadoAgenda, ConteoAgenda>> {
  const resultado = {} as Record<LadoAgenda, ConteoAgenda>
  for (const lado of ['pagar', 'cobrar'] as const) {
    const existentes = await leerExistentes(lado)
    const estadoPorId = new Map(existentes.map((e) => [e.id, e.estado]))
    const clavesConSaldo = new Set(
      opts.todosLosPendientes.filter((p) => p.lado === lado && p.pendienteCentavos > 0).map((p) => p.clave),
    )
    const manuales = await leerManuales(lado)
    const plan = planAgenda({ lado, enVentana: opts.pendientesEnVentana, clavesConSaldo, existentes, fechaDatos: opts.fechaDatos, manuales, plazos: opts.plazos })
    const conteo: ConteoAgenda = {
      crear: 0,
      actualizar: 0,
      cerrar: 0,
      reabrir: 0,
      saldosNegativos: plan.saldosNegativos.cantidad,
      posiblesDuplicados: plan.posiblesDuplicados,
      residuos: plan.residuos,
    }
    for (const op of plan.operaciones) conteo[op.tipo] += 1
    resultado[lado] = conteo
    if (opts.escribir) await aplicar(lado, plan.operaciones, estadoPorId, opts.fechaDatos)
  }
  return resultado
}

async function aplicar(
  lado: LadoAgenda,
  operaciones: OperacionAgenda[],
  estadoPorId: Map<string, string>,
  fechaDatos: string,
): Promise<void> {
  const db = adminDb()
  const coleccion = db.collection(lado === 'pagar' ? COMPROMISOS_COLLECTION : COBROS_COLLECTION)
  const abierto = lado === 'pagar' ? 'pendiente' : 'esperado'
  const cerrado = lado === 'pagar' ? 'pagado' : 'confirmado'
  const ahora = FieldValue.serverTimestamp()
  const historial = (estadoAnterior: string | null, estadoNuevo: string, nota: string) => ({
    estadoAnterior,
    estadoNuevo,
    usuario: ACTOR_VIENTRI,
    nota,
    fecha: ahora,
  })

  for (let i = 0; i < operaciones.length; i += 200) {
    const batch = db.batch()
    for (const op of operaciones.slice(i, i + 200)) {
      const ref = coleccion.doc(op.id)
      if (op.tipo === 'crear') {
        batch.set(ref, documentoNuevo(lado, op.datos, fechaDatos, op.posibleDuplicado))
        batch.set(ref.collection(HISTORIAL_SUB).doc(), historial(null, abierto, `Cargado en Vientri: ${op.datos.concepto}`))
      } else if (op.tipo === 'actualizar') {
        const patch: Record<string, unknown> = { ...camposVientri(lado, op.datos, fechaDatos), updatedAt: ahora }
        if (op.cambiarFecha) patch[lado === 'pagar' ? 'fechaVencimiento' : 'fechaEsperada'] = diaATimestamp(op.datos.fecha)
        batch.update(ref, patch)
      } else if (op.tipo === 'reabrir') {
        const patch: Record<string, unknown> = {
          ...camposVientri(lado, op.datos, fechaDatos),
          estado: abierto,
          updatedAt: ahora,
          ...(lado === 'pagar' ? { fechaPago: null, pagadoPor: null } : { fechaConfirmado: null, confirmadoPor: null }),
        }
        batch.update(ref, patch)
        batch.set(ref.collection(HISTORIAL_SUB).doc(), historial(cerrado, abierto, 'Vuelve a tener saldo en Vientri'))
      } else {
        const fecha = diaATimestamp(fechaDatos)
        batch.update(ref, {
          estado: cerrado,
          updatedAt: ahora,
          ...(lado === 'pagar'
            ? { fechaPago: fecha, pagadoPor: ACTOR_VIENTRI }
            : { fechaConfirmado: fecha, confirmadoPor: ACTOR_VIENTRI }),
        })
        batch.set(
          ref.collection(HISTORIAL_SUB).doc(),
          historial(estadoPorId.get(op.id) ?? abierto, cerrado, lado === 'pagar' ? 'Pagado según Vientri' : 'Cobrado según Vientri'),
        )
      }
    }
    await batch.commit()
  }
}
