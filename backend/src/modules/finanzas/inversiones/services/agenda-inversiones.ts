import { FieldValue, type DocumentReference, type Transaction } from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { listarPagos, restanteAPagarCentavos } from '../../agenda/domain/pago-compromiso.js'
import {
  COBROS_COLLECTION,
  COMPROMISOS_COLLECTION,
  defaultCobroFields,
  defaultCompromisoFields,
  timestampDiaArgentina,
} from '../../agenda/services/agenda.repository.js'
import {
  idCobroIngreso,
  idCompromisoCuota,
  planAgendaCuotas,
  planCobroIngreso,
  type CompromisoExistente,
  type DatosCompromisoCuota,
  type InversionParaAgenda,
} from '../domain/agenda-plan.js'
import type { InversionDocumentBase } from '../domain/inversion.types.js'
import { retencionDeCuota } from '../domain/retencion.js'
import { NoEncontrado } from '../domain/validar.js'
import type { HistorialEstadoDocument } from './inversiones.repository.js'
import { getConfigInversiones, INVERSIONES_COLLECTION, INVERSORES_COLLECTION } from './inversores.repository.js'

const HISTORIAL_SUB = 'historialEstados'

function paraAgenda(id: string, inv: InversionDocumentBase): InversionParaAgenda {
  return {
    id,
    numero: inv.numero,
    inversorNombre: inv.inversorNombre,
    moneda: inv.moneda,
    estado: inv.estado,
    cronograma: inv.cronograma,
    versionCronograma: inv.versionCronograma,
    mediosDevolucion: inv.mediosDevolucion,
    capitalCentavos: inv.capitalCentavos,
    fechaAlta: inv.fechaAlta,
    ingresos: inv.ingresos,
    renovacionDe: inv.renovacionDe,
    cuotasPrevias: inv.cuotasPrevias,
    sinVencimiento: inv.sinVencimiento,
  }
}

function existenteDe(id: string, d: Record<string, unknown>): CompromisoExistente {
  const estado = String(d.estado ?? '')
  const montoCentavos = typeof d.montoCentavos === 'number' ? d.montoCentavos : 0
  const restante = restanteAPagarCentavos({ estado, montoCentavos, pagos: listarPagos(d.pagos) })
  const inversion = d.inversion as { versionCronograma?: number } | undefined
  return {
    id,
    estado,
    anulado: d.anulado === true,
    montoCentavos,
    pagadoCentavos: montoCentavos - restante,
    versionCronograma: typeof inversion?.versionCronograma === 'number' ? inversion.versionCronograma : null,
  }
}

function camposCuota(inversionId: string, inv: InversionDocumentBase, numero: number, datos: DatosCompromisoCuota) {
  return {
    concepto: datos.concepto,
    proveedorONombre: datos.proveedorONombre,
    montoCentavos: datos.montoCentavos,
    moneda: datos.moneda,
    fechaVencimiento: timestampDiaArgentina(datos.fechaVencimiento),
    medioPago: datos.medioPago,
    grupo: inv.moneda === 'USD' ? 'Inversores USD' : 'Inversores pesos',
    cuotaNumero: datos.cuotaNumero,
    cuotaTotal: datos.cuotaTotal,
    observacion: datos.observacion,
    origen: 'inversiones',
    inversion: { inversionId, numero: inv.numero, cuotaNumero: numero, versionCronograma: datos.versionCronograma },
  }
}

function historialAgenda(estadoAnterior: string | null, estadoNuevo: string, uid: string, nota: string) {
  return { estadoAnterior, estadoNuevo, usuario: uid, nota, fecha: FieldValue.serverTimestamp() }
}

/**
 * Cambio de una inversión + su reflejo en la Agenda, todo en una transacción:
 * si algo falla no quedan cuotas a medias. Los ids son fijos (inv-<id>-c<n>), así que repetir es seguro.
 * `decidir` valida con el estado leído dentro de la transacción y devuelve cómo queda.
 */
export async function transicionConAgenda(
  id: string,
  uid: string,
  decidir: (actual: InversionDocumentBase) => { data: InversionDocumentBase; historial: HistorialEstadoDocument | null },
): Promise<string[]> {
  const db = adminDb()
  const invRef = db.collection(INVERSIONES_COLLECTION).doc(id)
  const compromisos = db.collection(COMPROMISOS_COLLECTION)
  const cobroRef = db.collection(COBROS_COLLECTION).doc(idCobroIngreso(id))

  const config = await getConfigInversiones()

  return db.runTransaction(async (tx: Transaction) => {
    // 1) Lecturas (Firestore exige leer todo antes de escribir).
    const snap = await tx.get(invRef)
    if (!snap.exists) throw new NoEncontrado('No encontré esa inversión.')
    const actual = snap.data() as InversionDocumentBase
    const { data, historial } = decidir(actual)
    const numeros = new Set([...actual.cronograma, ...data.cronograma].map((c) => c.numero))
    const refs: DocumentReference[] = [...numeros].map((n) => compromisos.doc(idCompromisoCuota(id, n)))
    const inversorRef = db.collection(INVERSORES_COLLECTION).doc(data.inversorId)
    const [cobroSnap, inversorSnap, ...compSnaps] = await tx.getAll(cobroRef, inversorRef, ...refs)
    const inscripto = inversorSnap.exists ? (inversorSnap.get('inscriptoGanancias') as boolean | null | undefined) : null
    // Los anulados no cuentan: si la cuota vuelve a corresponder, se crea de nuevo encima.
    const existentes = compSnaps
      .filter((s) => s.exists && s.get('anulado') !== true)
      .map((s) => existenteDe(s.id, s.data() as Record<string, unknown>))
    const porId = new Map(existentes.map((e) => [e.id, e]))

    // 2) Planes (puros, ver agenda-plan.ts).
    const inv = { ...paraAgenda(id, data), retencion: (c: Parameters<typeof retencionDeCuota>[0]) => retencionDeCuota(c, config.retencionGanancias, inscripto) }
    const ops = planAgendaCuotas(inv, existentes)
    const cobro = planCobroIngreso(
      inv,
      cobroSnap.exists ? { estado: String(cobroSnap.get('estado')), montoCentavos: Number(cobroSnap.get('montoCentavos') ?? 0) } : null,
    )
    const avisos = ops.filter((o) => o.tipo === 'conflicto').map((o) => `Cuota ${o.id.split('-c').at(-1)}: ${o.motivo}`)

    // 3) Escrituras.
    tx.set(invRef, { ...data, avisosAgenda: avisos })
    if (historial) tx.set(invRef.collection(HISTORIAL_SUB).doc(), historial)

    const ahora = FieldValue.serverTimestamp()
    for (const op of ops) {
      const ref = compromisos.doc(op.id)
      const numero = Number(op.id.split('-c').at(-1))
      if (op.tipo === 'crear') {
        tx.set(ref, {
          ...defaultCompromisoFields(),
          ...camposCuota(id, data, numero, op.datos),
          chequeId: null,
          estado: 'pendiente',
          anulado: false,
          createdAt: ahora,
          updatedAt: ahora,
          createdBy: uid,
        })
        tx.set(ref.collection(HISTORIAL_SUB).doc(), historialAgenda(null, 'pendiente', uid, `Cuota de la inversión ${data.numero}`))
      } else if (op.tipo === 'actualizar') {
        const antes = porId.get(op.id)?.estado ?? null
        const estado = 'pendiente'
        tx.update(ref, { ...camposCuota(id, data, numero, op.datos), estado, updatedAt: ahora })
        tx.set(ref.collection(HISTORIAL_SUB).doc(), historialAgenda(antes, estado, uid, `Cambió el cronograma de la inversión ${data.numero}`))
      } else if (op.tipo === 'anular') {
        tx.update(ref, { anulado: true, anuladoAt: ahora, anuladoMotivo: `Ya no corresponde a la inversión ${data.numero}`, updatedAt: ahora })
        tx.set(ref.collection(HISTORIAL_SUB).doc(), historialAgenda(porId.get(op.id)?.estado ?? null, 'anulado', uid, 'La cuota ya no corresponde'))
      }
    }

    if (cobro.tipo === 'crear') {
      tx.set(cobroRef, {
        ...defaultCobroFields(),
        clienteONombre: cobro.nombre,
        montoCentavos: cobro.montoCentavos,
        fechaEsperada: timestampDiaArgentina(cobro.fechaEsperada),
        chequeId: null,
        estado: cobro.confirmado ? 'confirmado' : 'esperado',
        moneda: cobro.moneda,
        origen: 'inversiones',
        inversion: { inversionId: id, numero: data.numero },
        concepto: cobro.concepto,
        anulado: false,
        createdAt: ahora,
        updatedAt: ahora,
        createdBy: uid,
      })
      tx.set(cobroRef.collection(HISTORIAL_SUB).doc(), historialAgenda(null, cobro.confirmado ? 'confirmado' : 'esperado', uid, cobro.concepto))
    } else if (cobro.tipo === 'actualizar_monto') {
      tx.update(cobroRef, { montoCentavos: cobro.montoCentavos, updatedAt: ahora })
    } else if (cobro.tipo === 'confirmar') {
      tx.update(cobroRef, { estado: 'confirmado', montoCentavos: cobro.montoCentavos, fechaConfirmado: ahora, confirmadoPor: uid, updatedAt: ahora })
      tx.set(cobroRef.collection(HISTORIAL_SUB).doc(), historialAgenda('esperado', 'confirmado', uid, 'Entró todo el capital'))
    }
    return avisos
  })
}
