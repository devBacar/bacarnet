import { logError, logInfo } from '../../lib/log.js'
import { ejecutarIngestaReal } from './services/ingestaRrhh.js'

const ACTOR_PROGRAMADO = 'system:rrhh-ingesta'

/** Tarea programada: procesa el último backup de Salario si todavía no se procesó. */
export async function runScheduledIngestaRrhh(): Promise<void> {
  const resultado = await ejecutarIngestaReal({ origen: 'programada', actorUid: ACTOR_PROGRAMADO })
  if (resultado.estado === 'error' || resultado.estado === 'sin_backup') {
    logError('[rrhh/ingesta] no se pudo procesar el backup de Salario', new Error(resultado.mensaje ?? resultado.estado))
    return
  }
  if (resultado.backupAtrasado) {
    logError(
      '[rrhh/ingesta] el último backup de Salario tiene más de 14 horas',
      new Error(`Último archivo: ${resultado.archivo ?? 'desconocido'}`),
    )
  }
  logInfo('[rrhh/ingesta] corrida programada', { estado: resultado.estado, archivo: resultado.archivo })
}
