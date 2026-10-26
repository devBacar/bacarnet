import { getDrive } from '../../../../lib/google/driveClient.js'
import { logError } from '../../../../lib/log.js'
import { getEnv } from '../../../../config/env.js'
import { ErrorValidacion } from '../domain/validar.js'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Trae la planilla de Inversores desde Google Sheets exportada como .xlsx, impersonando a quien
 * aprieta "Sincronizar ahora" (tiene que tener esa hoja compartida, aunque sea solo para ver).
 */
export async function descargarPlanillaInversoresDesdeDrive(subjectEmail: string): Promise<Buffer> {
  const spreadsheetId = getEnv().inversoresSheetId
  const drive = await getDrive(subjectEmail)
  try {
    const res = await drive.files.export(
      { fileId: spreadsheetId, mimeType: XLSX_MIME },
      { responseType: 'arraybuffer' },
    )
    return Buffer.from(res.data as ArrayBuffer)
  } catch (err) {
    logError('[finanzas/inversiones] no pude exportar la planilla desde Drive', err)
    throw new ErrorValidacion(
      'No pude leer la planilla de Inversores desde Google Drive. Revisá que esté compartida con tu cuenta de Bacar.',
    )
  }
}
