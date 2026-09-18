import type { Timestamp } from 'firebase-admin/firestore'
import type { CampanaArchivoFila, CampanaArchivoResumen } from './campanaAuditoriaLoad.js'
import type { CampanaProyectosSnapshot } from './campanaProyectosResumen.js'

export const CAMPANA_AUDITORIA_ARCHIVOS_COLLECTION = 'campanaAuditoriaArchivos'

export type CampanaAuditoriaArchivoRecord = {
  archivadoEn: Timestamp
  archivadoPorEmail: string
  anio: number
  mes: number
  semanaIso: number
  filas: CampanaArchivoFila[]
  resumen: CampanaArchivoResumen
  proyectosSnapshot: CampanaProyectosSnapshot
}

export type CampanaAuditoriaArchivoListItem = {
  id: string
  archivadoEn: string
  archivadoPorEmail: string
  anio: number
  mes: number
  semanaIso: number
  resumen: CampanaArchivoResumen
}
