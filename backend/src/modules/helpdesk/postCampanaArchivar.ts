import type { Request, Response } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import { getCampanaArchivoPeriod } from './campanaAuditoriaPeriod.js'
import {
  campanaArchivoFilaFromRow,
  campanaResumenFromFilas,
  loadCampanaAuditoriaEnrichedRows,
} from './campanaAuditoriaLoad.js'
import {
  CAMPANA_AUDITORIA_ARCHIVOS_COLLECTION,
  type CampanaAuditoriaArchivoRecord,
} from './campanaAuditoriaArchivoTypes.js'
import { loadCampanaProyectosSnapshot } from './campanaProyectosResumen.js'

const ARCHIVAR_ERROR = 'No se pudo archivar la campaña, intentá de nuevo'

export async function postCampanaArchivarHandler(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  try {
    const rows = await loadCampanaAuditoriaEnrichedRows()
    const filas = rows.map(campanaArchivoFilaFromRow)
    const resumen = campanaResumenFromFilas(filas)
    const areaHints = filas.map((f) => f.area ?? '').filter(Boolean)
    const proyectosSnapshot = await loadCampanaProyectosSnapshot(areaHints)
    const now = new Date()
    const { anio, mes, semanaIso } = getCampanaArchivoPeriod(now)

    const record: Omit<CampanaAuditoriaArchivoRecord, 'archivadoEn'> & {
      archivadoEn: ReturnType<typeof FieldValue.serverTimestamp>
    } = {
      archivadoEn: FieldValue.serverTimestamp(),
      archivadoPorEmail: user.email.trim().toLowerCase(),
      anio,
      mes,
      semanaIso,
      filas,
      resumen,
      proyectosSnapshot,
    }

    const ref = await adminDb().collection(CAMPANA_AUDITORIA_ARCHIVOS_COLLECTION).add(record)

    res.status(201).json({
      id: ref.id,
      anio,
      mes,
      semanaIso,
      resumen,
    })
  } catch (err) {
    logError('postCampanaArchivar falló', err)
    res.status(503).json({ error: ARCHIVAR_ERROR })
  }
}
