import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../lib/firebase/admin.js'
import type { ConfigPactadas } from '../domain/horasPactadas.js'
import type { ResultadoResumen } from '../domain/resumenMensual.js'
import type { Informe, InformeAgregado, InformeDetalle } from '../domain/informeMensual.js'
import type { RegistroIngestas } from './ingesta.service.js'

/**
 * Colecciones del módulo RRHH. Sin reglas en firestore.rules: el cliente no puede leerlas
 * (tienen sueldos y licencias médicas). Todo pasa por /api/rrhh con requireTableroRrhh.
 */
export const COLECCIONES_RRHH = {
  resumenMensual: 'rrhh_resumen_mensual',
  personas: 'rrhh_personas',
  catalogos: 'rrhh_catalogos',
  ingestas: 'rrhh_ingestas',
  informe: 'rrhh_informe',
  /** Un documento por mes (AAAAMM) con las personas y sus importes: solo perfil RRHH. */
  costosPersonas: 'rrhh_costos_personas',
  config: 'rrhh_config',
} as const

export const DOC_CONFIG_PACTADAS = 'pactadas'

function legajos(x: unknown): number[] {
  return Array.isArray(x) ? x.filter((n): n is number => Number.isInteger(n)) : []
}

/** Calendario oficial ya guardado (rrhh_config/feriados_AAAA). null si todavía no se trajo. */
export async function leerFeriadosGuardados(anio: number): Promise<Record<string, string> | null> {
  const snap = await adminDb().collection(COLECCIONES_RRHH.config).doc(`feriados_${anio}`).get()
  if (!snap.exists) return null
  const fechas = snap.get('fechas')
  if (!fechas || typeof fechas !== 'object') return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(fechas as Record<string, unknown>)) {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)) out[k] = v
  }
  return Object.keys(out).length ? out : null
}

export async function guardarFeriados(anio: number, fechas: Record<string, string>): Promise<void> {
  await adminDb().collection(COLECCIONES_RRHH.config).doc(`feriados_${anio}`).set({
    anio,
    fechas,
    origen: 'oficial',
    actualizadoAt: FieldValue.serverTimestamp(),
  })
}

/** Personas que RRHH confirmó o sacó de las horas pactadas (se aplica en la próxima ingesta). */
export async function leerConfigPactadas(): Promise<ConfigPactadas> {
  const snap = await adminDb().collection(COLECCIONES_RRHH.config).doc(DOC_CONFIG_PACTADAS).get()
  const datos = snap.data() ?? {}
  return { confirmadas: legajos(datos.confirmadas), descartadas: legajos(datos.descartadas) }
}

export type CambioPactada = 'confirmar' | 'descartar' | 'automatico'

/** confirmar: queda en la lista aunque el sistema no la detecte. descartar: sale de la lista. automatico: vuelve a decidir el sistema. */
export async function guardarCambioPactada(legajo: number, cambio: CambioPactada, actorUid: string): Promise<ConfigPactadas> {
  const ref = adminDb().collection(COLECCIONES_RRHH.config).doc(DOC_CONFIG_PACTADAS)
  await ref.set(
    {
      confirmadas: cambio === 'confirmar' ? FieldValue.arrayUnion(legajo) : FieldValue.arrayRemove(legajo),
      descartadas: cambio === 'descartar' ? FieldValue.arrayUnion(legajo) : FieldValue.arrayRemove(legajo),
      actualizadoPor: actorUid,
      actualizadoAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  return leerConfigPactadas()
}

export const DOC_INFORME_AGREGADO = 'agregado'
export const DOC_INFORME_DETALLE = 'detalle'

export const DOC_CATALOGO_SALARIO = 'salario'

export function idResumenMensual(mes: string, cc: number): string {
  return `${mes}_CC${cc}`
}

export interface InfoIngestaGuardada {
  ingestaId: string
  archivo: string
  backupCreado: string
  /** Filas leídas por tabla: la próxima ingesta las usa para detectar un backup incompleto. */
  filasPorTabla: Record<string, number>
}

export interface ConteoEscritura {
  resumenes: number
  personas: number
  borrados: number
}

/**
 * Reemplaza los datos derivados con el resultado de una ingesta.
 * Borra resúmenes de meses que quedaron fuera de la ventana y personas sin meses en ella.
 * No toca ninguna colección fuera de rrhh_*.
 */
export async function guardarResultado(
  resultado: ResultadoResumen,
  info: InfoIngestaGuardada,
): Promise<ConteoEscritura> {
  const db = adminDb()
  const writer = db.bulkWriter()
  const marca = { ingestaId: info.ingestaId, actualizadoAt: FieldValue.serverTimestamp() }

  const idsResumen = new Set<string>()
  for (const rc of resultado.centrosCosto) {
    const id = idResumenMensual(rc.mes, rc.cc)
    idsResumen.add(id)
    void writer.set(db.collection(COLECCIONES_RRHH.resumenMensual).doc(id), { ...rc, ...marca })
  }

  const idsPersona = new Set<string>()
  for (const persona of resultado.personas) {
    const id = String(persona.legajo)
    idsPersona.add(id)
    void writer.set(db.collection(COLECCIONES_RRHH.personas).doc(id), { ...persona, ...marca })
  }

  void writer.set(db.collection(COLECCIONES_RRHH.catalogos).doc(DOC_CATALOGO_SALARIO), {
    ...resultado.catalogos,
    feriadosPorMes: resultado.feriadosPorMes,
    meses: resultado.meses,
    ultimoMes: resultado.ultimoMes,
    archivo: info.archivo,
    backupCreado: info.backupCreado,
    filasPorTabla: info.filasPorTabla,
    ...marca,
  })

  let borrados = 0
  const viejosResumen = await db.collection(COLECCIONES_RRHH.resumenMensual).select().get()
  for (const doc of viejosResumen.docs) {
    if (!idsResumen.has(doc.id)) {
      void writer.delete(doc.ref)
      borrados += 1
    }
  }
  const viejasPersonas = await db.collection(COLECCIONES_RRHH.personas).select().get()
  for (const doc of viejasPersonas.docs) {
    if (!idsPersona.has(doc.id)) {
      void writer.delete(doc.ref)
      borrados += 1
    }
  }

  await writer.close()
  return { resumenes: idsResumen.size, personas: idsPersona.size, borrados }
}

/**
 * Informe mensual en dos documentos: el agregado (perfil Directorio, sin nombres ni legajos)
 * y el detalle por persona (perfil RRHH). Así cada endpoint lee un solo documento.
 */
export async function guardarInforme(informe: Informe, info: InfoIngestaGuardada): Promise<void> {
  const db = adminDb()
  const meta = {
    ingestaId: info.ingestaId,
    archivo: info.archivo,
    backupCreado: info.backupCreado,
    actualizadoAt: FieldValue.serverTimestamp(),
  }
  // Firestore no acepta campos undefined (por ejemplo, una recomendación sin impacto): se quitan.
  const sinUndefined = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T
  const batch = db.batch()
  batch.set(db.collection(COLECCIONES_RRHH.informe).doc(DOC_INFORME_AGREGADO), {
    ...sinUndefined(informe.agregado),
    ...meta,
  })
  batch.set(db.collection(COLECCIONES_RRHH.informe).doc(DOC_INFORME_DETALLE), {
    ...sinUndefined(informe.detalle),
    ...meta,
  })
  await batch.commit()

  // Personas con importes, un documento por mes; se borran los meses que ya no están en el informe.
  const writer = db.bulkWriter()
  const meses = new Set(Object.keys(informe.personasCostos ?? {}))
  for (const [mes, personas] of Object.entries(informe.personasCostos ?? {})) {
    void writer.set(db.collection(COLECCIONES_RRHH.costosPersonas).doc(mes), { mes, personas: sinUndefined(personas), ...meta })
  }
  const viejos = await db.collection(COLECCIONES_RRHH.costosPersonas).select().get()
  for (const doc of viejos.docs) if (!meses.has(doc.id)) void writer.delete(doc.ref)
  await writer.close()
}

/** Personas de un mes con sus importes (solo RRHH). */
export async function leerCostosPersonas(mes: string): Promise<{ mes: string; personas: unknown[] } | null> {
  const snap = await adminDb().collection(COLECCIONES_RRHH.costosPersonas).doc(mes).get()
  if (!snap.exists) return null
  const personas = snap.get('personas')
  return { mes, personas: Array.isArray(personas) ? personas : [] }
}

export interface MetaInforme {
  archivo: string | null
  backupCreado: string | null
  actualizado: string | null
}

async function leerDocInforme<T>(id: string): Promise<(T & { meta: MetaInforme }) | null> {
  const snap = await adminDb().collection(COLECCIONES_RRHH.informe).doc(id).get()
  if (!snap.exists) return null
  const { ingestaId: _ingestaId, archivo, backupCreado, actualizadoAt, ...datos } = snap.data() ?? {}
  return {
    ...(datos as T),
    meta: {
      archivo: typeof archivo === 'string' ? archivo : null,
      backupCreado: typeof backupCreado === 'string' ? backupCreado : null,
      actualizado: actualizadoAt instanceof Timestamp ? actualizadoAt.toDate().toISOString() : null,
    },
  }
}

export function leerInformeAgregado() {
  return leerDocInforme<InformeAgregado>(DOC_INFORME_AGREGADO)
}

export function leerInformeDetalle() {
  return leerDocInforme<InformeDetalle>(DOC_INFORME_DETALLE)
}

/** Datos de la última ingesta que se guardó bien (están en rrhh_catalogos/salario). */
export async function leerUltimaIngestaOk(): Promise<{
  ultimoMes: string | null
  filasPorTabla: Record<string, number>
} | null> {
  const snap = await adminDb().collection(COLECCIONES_RRHH.catalogos).doc(DOC_CATALOGO_SALARIO).get()
  if (!snap.exists) return null
  const filas = snap.get('filasPorTabla')
  return {
    ultimoMes: typeof snap.get('ultimoMes') === 'string' ? (snap.get('ultimoMes') as string) : null,
    filasPorTabla: filas && typeof filas === 'object' ? (filas as Record<string, number>) : {},
  }
}

/** Registro de corridas en rrhh_ingestas. El id es el del archivo + su md5. */
export const registroIngestasFirestore: RegistroIngestas = {
  async tomar(id, datos, opciones) {
    const db = adminDb()
    const ref = db.collection(COLECCIONES_RRHH.ingestas).doc(id)
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (snap.exists) {
        const estado = snap.get('estado') as string | undefined
        if (estado === 'ok' && !opciones.forzar) return 'ya_procesado' as const
        const inicio = snap.get('inicio') as Timestamp | undefined
        const vigente = inicio && datos.inicio.getTime() - inicio.toMillis() < opciones.vencimientoMs
        if (estado === 'en_curso' && vigente) return 'en_curso' as const
      }
      tx.set(ref, {
        ...datos,
        inicio: Timestamp.fromDate(datos.inicio),
        estado: 'en_curso',
        intentos: FieldValue.increment(1),
      }, { merge: true })
      return 'tomada' as const
    })
  },

  async terminar(id, datos) {
    await adminDb()
      .collection(COLECCIONES_RRHH.ingestas)
      .doc(id)
      .set({ ...datos, fin: Timestamp.fromDate(datos.fin) }, { merge: true })
  },

  async registrarSinBackup(datos) {
    await adminDb()
      .collection(COLECCIONES_RRHH.ingestas)
      .add({ ...datos, estado: 'sin_backup', inicio: Timestamp.fromDate(datos.fecha) })
  },
}

export interface IngestaListada {
  id: string
  estado: string
  origen: string | null
  archivo: string | null
  inicio: string | null
  duracionMs: number | null
  ultimoMes: string | null
  backupAtrasado: boolean
  mensaje: string | null
}

/** Últimas corridas, de la más nueva a la más vieja. */
export async function listarIngestas(limite = 20): Promise<IngestaListada[]> {
  const snap = await adminDb()
    .collection(COLECCIONES_RRHH.ingestas)
    .orderBy('inicio', 'desc')
    .limit(limite)
    .get()
  return snap.docs.map((doc) => {
    const d = doc.data()
    const inicio = d.inicio as Timestamp | undefined
    return {
      id: doc.id,
      estado: String(d.estado ?? ''),
      origen: typeof d.origen === 'string' ? d.origen : null,
      archivo: typeof d.archivo === 'string' ? d.archivo : null,
      inicio: inicio ? inicio.toDate().toISOString() : null,
      duracionMs: typeof d.duracionMs === 'number' ? d.duracionMs : null,
      ultimoMes: typeof d.ultimoMes === 'string' ? d.ultimoMes : null,
      backupAtrasado: d.backupAtrasado === true,
      mensaje: typeof d.mensaje === 'string' ? d.mensaje : null,
    }
  })
}
