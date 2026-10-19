import { logError, logInfo } from '../../../lib/log.js'
import { horasDesdeFechaDatos } from './domain/zip.js'
import { traerVientriDesdeDrive } from './services/traer-desde-drive.js'
import { leerEstado } from './services/vientri.repository.js'

const ACTOR_PROGRAMADO = 'system:vientri-diario'

/** Pasadas las 9, si los datos tienen más de 30 horas se avisa (queda como error en los logs). */
export const HORAS_MAXIMAS = 30

/**
 * Tarea programada: busca el zip más nuevo de Vientri en Drive y lo importa si todavía no se importó.
 * Corre varias veces a la mañana; si no hay nada nuevo no hace nada.
 */
export async function runScheduledVientri(ahora: Date = new Date()): Promise<void> {
  const r = await traerVientriDesdeDrive({ origen: 'programada', actor: ACTOR_PROGRAMADO })
  if (r.estado === 'error' || r.estado === 'sin_archivo') {
    logError('[finanzas/vientri] no se pudieron traer los datos de Vientri', new Error(r.mensaje))
  } else {
    logInfo('[finanzas/vientri] corrida programada', { estado: r.estado, archivo: 'archivo' in r ? r.archivo : null })
  }

  const horaArgentina = (ahora.getUTCHours() + 21) % 24
  if (horaArgentina < 9) return
  const estado = await leerEstado()
  const horas = estado?.fechaDatos ? horasDesdeFechaDatos(estado.fechaDatos, ahora) : Number.POSITIVE_INFINITY
  if (horas > HORAS_MAXIMAS) {
    logError(
      '[finanzas/vientri] los datos de Vientri están atrasados',
      new Error(`Fecha de los datos: ${estado?.fechaDatos ?? 'ninguna'}. Revisar las tareas del servidor (02:00) y de SIS5 (05:00).`),
    )
  }
}
