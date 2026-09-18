import type { Request, Response } from 'express'
import type { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '../../lib/firebase/admin.js'
import { logError } from '../../lib/log.js'
import {
  campanaArchivoFilaFromRow,
  campanaResumenFromFilas,
  loadCampanaAuditoriaEnrichedRows,
} from './campanaAuditoriaLoad.js'
import { renderCampanaAuditoriaPdf } from './campanaAuditoriaPdf.js'
import {
  CAMPANA_AUDITORIA_ARCHIVOS_COLLECTION,
  type CampanaAuditoriaArchivoRecord,
} from './campanaAuditoriaArchivoTypes.js'
import { loadCampanaProyectosSnapshot } from './campanaProyectosResumen.js'

function timestampToIso(value: Timestamp | undefined): string | null {
  if (!value || typeof value.toDate !== 'function') return null
  return value.toDate().toISOString()
}

export async function getCampanaAuditoriaPdfHandler(req: Request, res: Response): Promise<void> {
  const archivoId =
    typeof req.query.archivoId === 'string' && req.query.archivoId.trim()
      ? req.query.archivoId.trim()
      : null

  try {
    let filas
    let resumen
    let proyectos
    let generatedAtIso = new Date().toISOString()
    let archivedFootnote: string | undefined

    if (archivoId) {
      const snap = await adminDb()
        .collection(CAMPANA_AUDITORIA_ARCHIVOS_COLLECTION)
        .doc(archivoId)
        .get()
      if (!snap.exists) {
        res.status(404).json({ error: 'Archivo no encontrado' })
        return
      }
      const data = snap.data() as CampanaAuditoriaArchivoRecord
      filas = data.filas
      resumen = data.resumen
      proyectos =
        data.proyectosSnapshot ??
        (await loadCampanaProyectosSnapshot(filas.map((f) => f.area ?? '')))
      generatedAtIso = timestampToIso(data.archivadoEn) ?? generatedAtIso
      archivedFootnote = `Copia archivada (${generatedAtIso.slice(0, 10)}). No refleja el estado actual de la campaña.`
    } else {
      const rows = await loadCampanaAuditoriaEnrichedRows()
      filas = rows.map(campanaArchivoFilaFromRow)
      resumen = campanaResumenFromFilas(filas)
      proyectos = await loadCampanaProyectosSnapshot(filas.map((f) => f.area ?? ''))
    }

    const pdf = await renderCampanaAuditoriaPdf({
      generatedAtIso,
      archivedFootnote,
      filas,
      resumen,
      proyectos,
    })

    const stamp = generatedAtIso.slice(0, 10)
    const filename = archivoId
      ? `auditoria-campana-archivo-${stamp}.pdf`
      : `auditoria-campana-${stamp}.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', String(pdf.length))
    res.send(pdf)
  } catch (err) {
    logError('getCampanaAuditoriaPdf falló', err)
    res.status(503).json({ error: 'No se pudo generar el PDF' })
  }
}
