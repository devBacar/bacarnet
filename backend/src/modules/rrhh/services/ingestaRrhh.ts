import { logInfo } from '../../../lib/log.js'
import { abrirBackup, buscarUltimoBackup } from './backupsDrive.js'
import { ejecutarIngestaRrhh, type OrigenIngesta, type ResultadoIngesta } from './ingesta.service.js'
import { guardarResultado, leerUltimaIngestaOk, registroIngestasFirestore } from './rrhh.repository.js'

/** Ingesta con Drive y Firestore reales. La usan la tarea programada y el endpoint manual. */
export function ejecutarIngestaReal(opciones: {
  origen: OrigenIngesta
  actorUid: string
  forzar?: boolean
}): Promise<ResultadoIngesta> {
  return ejecutarIngestaRrhh(
    {
      buscarUltimoBackup,
      abrirBackup,
      guardarResultado,
      ultimaIngestaOk: leerUltimaIngestaOk,
      registro: registroIngestasFirestore,
      ahora: () => new Date(),
      log: logInfo,
    },
    opciones,
  )
}
