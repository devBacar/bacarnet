import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../../lib/firebase/admin.js'
import type { ResultadoResumen } from '../domain/resumenMensual.js'
import type { RegistroIngestas } from './ingesta.service.js'

/**
 * Colecciones del módulo RRHH. Sin reglas en firestore.rules: el cliente no puede leerlas
 * (tienen sueldos y licencias médicas). Todo pasa por /api/rrhh con requireRrhh.
 */
export const COLECCIONES_RRHH = {
  resumenMensual: 'rrhh_resumen_mensual',
  personas: 'rrhh_personas',
  catalogos: 'rrhh_catalogos',
  ingestas: 'rrhh_ingestas',
} as const

export const DOC_CATALOGO_SALARIO = 'salario'

export function idResumenMensual(mes: string, cc: number): string {
  return `${mes}_CC${cc}`
}

export interface InfoIngestaGuardada {
  ingestaId: string
  archivo: string
  backupCreado: string
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
