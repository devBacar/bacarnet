import type { Request, Response } from 'express'
import type { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import {
  CAMPANA_AUDITORIA_ARCHIVOS_COLLECTION,
  type CampanaAuditoriaArchivoListItem,
  type CampanaAuditoriaArchivoRecord,
} from './campanaAuditoriaArchivoTypes.js'

function timestampToIso(value: Timestamp | undefined): string | null {
  if (!value || typeof value.toDate !== 'function') return null
  return value.toDate().toISOString()
}

export async function getCampanaArchivosHandler(_req: Request, res: Response): Promise<void> {
  try {
    const snap = await adminDb()
      .collection(CAMPANA_AUDITORIA_ARCHIVOS_COLLECTION)
      .orderBy('archivadoEn', 'desc')
      .limit(200)
      .get()

    const archivos: CampanaAuditoriaArchivoListItem[] = snap.docs.map((doc) => {
      const data = doc.data() as CampanaAuditoriaArchivoRecord
      return {
        id: doc.id,
        archivadoEn: timestampToIso(data.archivadoEn) ?? new Date(0).toISOString(),
        archivadoPorEmail: data.archivadoPorEmail,
        anio: data.anio,
        mes: data.mes,
        semanaIso: data.semanaIso,
        resumen: data.resumen,
      }
    })

    res.json({ archivos })
  } catch (err) {
    logError('getCampanaArchivos falló', err)
    res.status(503).json({ error: 'No se pudo listar el historial archivado' })
  }
}

export async function getCampanaArchivoByIdHandler(req: Request, res: Response): Promise<void> {
  const archivoId = typeof req.params.archivoId === 'string' ? req.params.archivoId.trim() : ''
  if (!archivoId) {
    res.status(400).json({ error: 'archivoId inválido' })
    return
  }

  try {
    const snap = await adminDb()
      .collection(CAMPANA_AUDITORIA_ARCHIVOS_COLLECTION)
      .doc(archivoId)
      .get()
    if (!snap.exists) {
      res.status(404).json({ error: 'Archivo no encontrado' })
      return
    }
    const data = snap.data() as CampanaAuditoriaArchivoRecord
    res.json({
      id: snap.id,
      archivadoEn: timestampToIso(data.archivadoEn),
      archivadoPorEmail: data.archivadoPorEmail,
      anio: data.anio,
      mes: data.mes,
      semanaIso: data.semanaIso,
      filas: data.filas,
      resumen: data.resumen,
      proyectosSnapshot: data.proyectosSnapshot ?? null,
    })
  } catch (err) {
    logError('getCampanaArchivoById falló', err)
    res.status(503).json({ error: 'No se pudo cargar el archivo archivado' })
  }
}
