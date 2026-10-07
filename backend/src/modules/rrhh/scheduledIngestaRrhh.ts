import { logError, logInfo } from '../../lib/log.js'
import { tableroRrhhConfigurado } from './boardRrhhConfig.js'
import { ejecutarIngestaReal } from './services/ingestaRrhh.js'

const ACTOR_PROGRAMADO = 'system:rrhh-ingesta'

/**
 * Tarea programada: procesa el último backup de Salario si todavía no se procesó.
 * Depende solo de que el tablero de RRHH esté configurado (RRHH_BOARD_FOLDER_ID), no del interruptor rrhhEnabled,
 * que queda reservado para un futuro módulo RRHH. Desde el tablero también se puede actualizar a mano.
 */
export async function runScheduledIngestaRrhh(): Promise<void> {
  if (!tableroRrhhConfigurado()) {
    logInfo('[rrhh/ingesta] tablero de RRHH sin configurar (RRHH_BOARD_FOLDER_ID): no se procesa el backup')
    return
  }
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
